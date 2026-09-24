import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalRequest } from '../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort, ApprovalTransition } from '../domain/approvalRequest.repository.port.js';
import type { ApprovalKindRegistry } from './approvalKindRegistry.js';

/**
 * The one way a request changes status after submission: the conditional write and the owning
 * module's `onStatusChange` commit in a single transaction, so the two can never disagree. A
 * write that loses a race (status moved on) becomes a 409 and nothing is committed.
 */
export async function applyTransition(
  deps: { requests: ApprovalRequestRepositoryPort; kinds: ApprovalKindRegistry; transactions: TransactionRunnerPort },
  request: ApprovalRequest,
  change: ApprovalTransition,
): Promise<ApprovalRequest> {
  const kind = deps.kinds.get(request.kind);
  return deps.transactions.run(async (ctx) => {
    const updated = await deps.requests.transition(request.id, request.status, change, ctx);
    if (!updated) throw AppError.conflict('Someone else acted on this request first. Reload it.');
    await kind.onStatusChange?.(
      {
        requestId: updated.id,
        kind: updated.kind,
        recordId: updated.recordId,
        submitterId: updated.submitterId,
        previousStatus: request.status,
        status: updated.status,
        action: change.action,
        request: updated,
      },
      ctx,
    );
    return updated;
  });
}
