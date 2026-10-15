import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import { appEvents } from '@/shared/events/appEvents.js';
import type { ApprovalRequest } from '../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort, ApprovalTransition } from '../domain/approvalRequest.repository.port.js';
import type { ApprovalKindRegistry } from './approvalKindRegistry.js';

/**
 * The one way a request changes status after submission: the conditional write and the owning
 * module's `onStatusChange` commit in a single transaction, so the two can never disagree. A
 * write that loses a race (status or cycle moved on) becomes a 409 and nothing is committed.
 */
export async function applyTransition(
  deps: { requests: ApprovalRequestRepositoryPort; kinds: ApprovalKindRegistry; transactions: TransactionRunnerPort },
  request: ApprovalRequest,
  change: ApprovalTransition,
): Promise<ApprovalRequest> {
  const kind = deps.kinds.get(request.kind);
  const updated = await deps.transactions.run(async (ctx) => {
    const expected = { status: request.status, cycle: request.cycle };
    const updated = await deps.requests.transition(request.id, expected, change, ctx);
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
  // After the commit, so a retried transaction never announces twice. The submitter hears the answer; not when they gave it themselves.
  if ((updated.status === 'APPROVED' || updated.status === 'REJECTED') && (change.action.authority === 'AUTO' || change.action.actorId !== updated.submitterId)) {
    appEvents.emit('approval.decided', {
      kind: updated.kind,
      recordId: updated.recordId,
      submitterId: updated.submitterId,
      status: updated.status,
      comment: change.action.comment,
      actorId: change.action.actorId,
      auto: change.action.authority === 'AUTO',
    });
  }
  return updated;
}
