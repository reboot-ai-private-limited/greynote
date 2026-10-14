import { computeStructuredBreakdown } from '../../domain/ctcBreakdown.js';
import type { CtcAssignmentRepositoryPort } from '../../domain/ctcAssignment.repository.port.js';
import type { PayComponentRepositoryPort } from '../../domain/payComponent.repository.port.js';
import type { CtcContextPort } from './ctcContext.js';

export type ReapplyOutcome =
  | { userId: string; outcome: 'revised'; revisionId: string }
  | { userId: string; outcome: 'skipped'; message: string };

const FAR_FUTURE = '9999-12';

/**
 * After Admin changes the formula, saves a fresh revision for each employee from `effectiveFrom`: same CTC, same HR
 * overrides and own structure (Basic %, edited, removed and added lines), current formula. Each employee is independent — one whose overrides no longer fit is skipped with a reason,
 * never failing the rest.
 */
export class ReapplyCtcUseCase {
  constructor(
    private readonly components: PayComponentRepositoryPort,
    private readonly assignments: CtcAssignmentRepositoryPort,
    private readonly context: CtcContextPort,
  ) {}

  async execute(input: { effectiveFrom: string; reason?: string | null; userIds?: string[] }, createdBy: string): Promise<ReapplyOutcome[]> {
    const formula = await this.components.list();
    const ctx = await this.context.read();
    const userIds = input.userIds ?? (await this.assignments.listUserIds());
    const outcomes: ReapplyOutcome[] = [];
    for (const userId of userIds) {
      const latest = await this.assignments.findEffective(userId, FAR_FUTURE);
      if (!latest) {
        outcomes.push({ userId, outcome: 'skipped', message: 'No CTC assigned yet.' });
        continue;
      }
      try {
        const lines = computeStructuredBreakdown(
          formula,
          latest.ctcAnnualPaise,
          latest.structure,
          latest.overrides,
          ctx,
        );
        const created = await this.assignments.create({
          userId,
          ctcAnnualPaise: latest.ctcAnnualPaise,
          effectiveFrom: input.effectiveFrom,
          overrides: latest.overrides,
          structure: latest.structure,
          lines,
          reason: input.reason ?? 'Formula re-applied',
          createdBy,
        });
        outcomes.push({ userId, outcome: 'revised', revisionId: created.id });
      } catch (error) {
        outcomes.push({ userId, outcome: 'skipped', message: error instanceof Error ? error.message : 'Could not recompute.' });
      }
    }
    return outcomes;
  }
}
