import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalStatus } from '../../domain/approvalRequest.entity.js';
import type { Actor } from '../../domain/approvalRules.js';
import type { DecideApprovalUseCase } from './decideApproval.usecase.js';

export const MAX_BULK = 100;

export type BulkResult =
  | { requestId: string; ok: true; status: ApprovalStatus }
  | { requestId: string; ok: false; statusCode: number; message: string };

/**
 * Approve or reject many at once — each one independently, through the same rules and its own
 * transaction as a single decision. One failure (already decided, not yours) doesn't stop the
 * rest; the result says what happened to each.
 */
export class BulkDecideApprovalUseCase {
  constructor(private readonly decide: DecideApprovalUseCase) {}

  async execute(input: {
    requestIds: string[];
    actor: Actor;
    decision: 'APPROVE' | 'REJECT';
    comment?: string | null | undefined;
  }): Promise<BulkResult[]> {
    const results: BulkResult[] = [];
    // Sequential: keeps load on the database (and the owning modules' callbacks) predictable.
    for (const requestId of [...new Set(input.requestIds)]) {
      try {
        const updated = await this.decide.execute({ ...input, requestId });
        results.push({ requestId, ok: true, status: updated.status });
      } catch (err) {
        if (!(err instanceof AppError) || !err.isExpected) throw err;
        results.push({ requestId, ok: false, statusCode: err.statusCode, message: err.message });
      }
    }
    return results;
  }
}
