import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { isOpen } from '../../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';
import type { ApprovalKindRegistry } from '../approvalKindRegistry.js';
import { applyTransition } from '../applyTransition.js';

/**
 * The owning module closes a request nobody can usefully decide any more (a leave whose first day has passed). Same transaction and
 * `onStatusChange` as a manual rejection, recorded with `AUTO` authority and the submitter as the nominal actor. Returns false when the
 * request is gone, already decided, or someone acted first — all fine for a sweep that runs again.
 */
export class AutoRejectApprovalUseCase {
  constructor(
    private readonly requests: ApprovalRequestRepositoryPort,
    private readonly kinds: ApprovalKindRegistry,
    private readonly transactions: TransactionRunnerPort,
  ) {}

  async execute(kind: string, recordId: string, reason: string): Promise<boolean> {
    const request = await this.requests.findByRecord(kind, recordId);
    if (!request || !isOpen(request.status)) return false;
    try {
      await applyTransition({ requests: this.requests, kinds: this.kinds, transactions: this.transactions }, request, {
        status: 'REJECTED',
        decidedAt: new Date(),
        action: {
          action: 'REJECT',
          authority: 'AUTO',
          actorId: request.submitterId,
          actorRole: 'FIELD',
          comment: `Automatic: ${reason}`,
          at: new Date(),
          resultingStatus: 'REJECTED',
          cycle: request.cycle,
        },
      });
      return true;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 409) return false;
      throw err;
    }
  }
}
