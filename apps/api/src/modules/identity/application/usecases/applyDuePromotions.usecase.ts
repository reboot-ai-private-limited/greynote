import { logger } from '@/shared/logging/logger.js';
import { CtcBreakdownError, computeCtcBreakdown } from '../../domain/ctcBreakdown.js';
import type { CtcAssignmentRepositoryPort } from '../../domain/ctcAssignment.repository.port.js';
import type { EmployeeProfileRepositoryPort } from '../../domain/employeeProfile.repository.port.js';
import type { ManagerHistoryRepositoryPort } from '../../domain/managerHistory.repository.port.js';
import type { PayComponentRepositoryPort } from '../../domain/payComponent.repository.port.js';
import type { Promotion, PromotionTeamMove } from '../../domain/promotion.entity.js';
import type { PromotionRepositoryPort } from '../../domain/promotion.repository.port.js';
import { reachesUpward } from '../../domain/reportingChain.js';
import type { UserRepositoryPort } from '../../domain/user.repository.port.js';

/** How long a run's hold on a promotion lasts. A run that crashes leaves it SCHEDULED, and the next run after this takes it again. */
export const PROMOTION_CLAIM_LEASE_MS = 10 * 60 * 1000;

export interface ApplyDueResult {
  applied: number;
  failed: number;
}

/**
 * Applies every promotion whose month has come (`effectiveFrom` is this month or earlier), oldest first. Run by the server on
 * start and every hour, and by an Admin/HR button; no operator cron. Safe to run at any time and from any number of servers: each
 * promotion is claimed atomically, and each step checks what is already done, so a run that stopped half-way is finished by the next.
 *
 * Order: the CTC revision (it can fail on a changed formula, and then nothing else has moved), the team (each report only if they
 * still report to the promoted person and the new manager is still usable), then the person's own designation, grade and manager.
 * What cannot be carried out never blocks the rest: the promotion applies, the person is left where they were, and it shows under
 * "Needs attention".
 */
export class ApplyDuePromotionsUseCase {
  constructor(
    private readonly promotions: PromotionRepositoryPort,
    private readonly profiles: EmployeeProfileRepositoryPort,
    private readonly users: UserRepositoryPort,
    private readonly components: PayComponentRepositoryPort,
    private readonly assignments: CtcAssignmentRepositoryPort,
    private readonly history: ManagerHistoryRepositoryPort,
    private readonly currentMonth: () => Promise<string>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<ApplyDueResult> {
    const month = await this.currentMonth();
    const result: ApplyDueResult = { applied: 0, failed: 0 };
    for (;;) {
      const promotion = await this.promotions.claimDue(month, this.now(), PROMOTION_CLAIM_LEASE_MS);
      if (!promotion) return result;
      try {
        await this.apply(promotion);
        result.applied += 1;
      } catch (error) {
        result.failed += 1;
        const message = error instanceof CtcBreakdownError ? `The CTC could not be worked out: ${error.message}` : error instanceof Error ? error.message : 'Could not apply.';
        logger.error({ promotionId: promotion.id, userId: promotion.userId, err: error }, 'promotion could not be applied');
        await this.promotions.markFailed(promotion.id, message);
      }
    }
  }

  private async apply(p: Promotion): Promise<void> {
    const employee = await this.users.findById(p.userId);
    if (!employee) throw new Error('The employee no longer exists.');
    if (employee.status === 'inactive') throw new Error('The employee is no longer active. Cancel this promotion.');

    // 1. The CTC revision, once.
    let ctcAssignmentId = p.ctcAssignmentId;
    if (p.ctc && !ctcAssignmentId) {
      const lines = computeCtcBreakdown(await this.components.list(), p.ctc.ctcAnnualPaise, p.ctc.overrides);
      const created = await this.assignments.create({ userId: p.userId, ctcAnnualPaise: p.ctc.ctcAnnualPaise, effectiveFrom: p.effectiveFrom, overrides: p.ctc.overrides, lines, reason: 'Promotion', createdBy: p.createdBy });
      ctcAssignmentId = created.id;
      await this.promotions.markCtcAssignment(p.id, created.id);
    }

    // 2. The team.
    const skipped: PromotionTeamMove[] = [];
    const managerOf = async (id: string) => (await this.profiles.findByUserId(id))?.managerId ?? null;
    for (const move of p.teamMoves) {
      if (move.toManagerId === p.userId) continue; // stays
      const current = await managerOf(move.userId);
      if (current !== p.userId) continue; // already moved, or moved by someone since: leave it be
      const target = await this.users.findById(move.toManagerId);
      if (!target || target.status === 'inactive' || (await reachesUpward(managerOf, move.toManagerId, move.userId)) || move.toManagerId === move.userId) {
        skipped.push(move);
        continue;
      }
      await this.profiles.upsert(move.userId, { managerId: move.toManagerId });
      await this.history.record({ userId: move.userId, managerId: move.toManagerId, previousManagerId: p.userId, effectiveFrom: p.effectiveFrom, source: 'PROMOTION', promotionId: p.id, createdBy: p.createdBy });
    }

    // Reports who were not in the plan stay, and are flagged.
    const planned = new Set(p.teamMoves.map((m) => m.userId));
    const underNow = await this.profiles.findUserIdsByFilter({ managerId: p.userId });
    const candidates = underNow.filter((id) => !planned.has(id));
    const unplanned = (await this.users.findByIds(candidates)).filter((u) => u.status !== 'inactive').map((u) => u.id);

    // 3. The person's own designation, grade and manager.
    const notes: string[] = [];
    const own = await this.profiles.findByUserId(p.userId);
    const change: { designationId?: string; payBandId?: string; managerId?: string } = {};
    if (p.toDesignationId) change.designationId = p.toDesignationId;
    if (p.toPayBandId) change.payBandId = p.toPayBandId;
    if (p.toManagerId && p.toManagerId !== own?.managerId) {
      const manager = await this.users.findById(p.toManagerId);
      if (!manager || manager.status === 'inactive') notes.push('The chosen new manager is no longer active, so the manager was not changed.');
      else if (p.toManagerId === p.userId || (await reachesUpward(managerOf, p.toManagerId, p.userId))) notes.push('The chosen new manager would now report to this employee, so the manager was not changed.');
      else change.managerId = p.toManagerId;
    }
    if (Object.keys(change).length > 0) await this.profiles.upsert(p.userId, change);
    if (change.managerId) {
      await this.history.record({ userId: p.userId, managerId: change.managerId, previousManagerId: own?.managerId ?? null, effectiveFrom: p.effectiveFrom, source: 'PROMOTION', promotionId: p.id, createdBy: p.createdBy });
    }

    if (skipped.length > 0) notes.push(`${skipped.length} planned move${skipped.length === 1 ? '' : 's'} could not be carried out.`);
    await this.promotions.markApplied(p.id, { appliedAt: this.now(), note: notes.length > 0 ? notes.join(' ') : null, skippedMoves: skipped, unplannedReportIds: unplanned });
  }
}
