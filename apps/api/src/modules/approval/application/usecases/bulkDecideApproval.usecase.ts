import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalStatus } from '../../domain/approvalRequest.entity.js';
import type { Actor } from '../../domain/approvalRules.js';
import type { DecideApprovalUseCase } from './decideApproval.usecase.js';

export const MAX_BULK = 100;

export type BulkResult =
  | { requestId: string; ok: true; status: ApprovalStatus }
  | { requestId: string; ok: false; statusCode: number; message: string };

/** Where an item's unexpected failure goes — the composition root logs it at `error`. */
export type BulkFaultReporter = (requestId: string, err: unknown) => void;

/** `AppError.internal`'s customer-facing text: the cause is logged, never returned. */
const FAULT_MESSAGE = 'Something went wrong. Please try again shortly.';

/**
 * Approve or reject many at once — each one independently, through the same rules and its own
 * transaction as a single decision. One failure (already decided, not yours, or a genuine fault)
 * doesn't stop the rest: earlier items are already committed, so the caller must always get the
 * per-item results back, never a bare 500.
 */
export class BulkDecideApprovalUseCase {
  constructor(
    private readonly decide: DecideApprovalUseCase,
    private readonly reportFault: BulkFaultReporter = () => {},
  ) {}

  async execute(input: {
    requests: Array<{ requestId: string; expectedCycle?: number | undefined }>;
    actor: Actor;
    decision: 'APPROVE' | 'REJECT';
    comment?: string | null | undefined;
  }): Promise<BulkResult[]> {
    const results: BulkResult[] = [];
    const seen = new Set<string>();
    // Sequential: keeps load on the database (and the owning modules' callbacks) predictable.
    for (const { requestId, expectedCycle } of input.requests) {
      if (seen.has(requestId)) continue;
      seen.add(requestId);
      try {
        const updated = await this.decide.execute({
          requestId,
          expectedCycle,
          actor: input.actor,
          decision: input.decision,
          comment: input.comment,
        });
        results.push({ requestId, ok: true, status: updated.status });
      } catch (err) {
        if (err instanceof AppError && err.isExpected) {
          results.push({ requestId, ok: false, statusCode: err.statusCode, message: err.message });
        } else {
          this.reportFault(requestId, err);
          results.push({ requestId, ok: false, statusCode: 500, message: FAULT_MESSAGE });
        }
      }
    }
    return results;
  }
}
