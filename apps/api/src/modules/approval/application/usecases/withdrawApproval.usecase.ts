import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalRequest } from '../../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';
import type { Actor } from '../../domain/approvalRules.js';
import type { ApprovalKindRegistry } from '../approvalKindRegistry.js';
import { applyTransition } from '../applyTransition.js';

/**
 * The submitter pulls their own request back — only while the manager hasn't acted yet (client
 * rules §11.4). They can then edit the record and resubmit.
 */
export class WithdrawApprovalUseCase {
  constructor(
    private readonly requests: ApprovalRequestRepositoryPort,
    private readonly kinds: ApprovalKindRegistry,
    private readonly transactions: TransactionRunnerPort,
  ) {}

  async execute(requestId: string, actor: Actor, comment?: string | null): Promise<ApprovalRequest> {
    const request = await this.requests.findById(requestId);
    if (!request) throw AppError.notFound();
    if (request.submitterId !== actor.id) throw AppError.forbidden('Only the employee who submitted this can withdraw it.');
    if (request.status !== 'SUBMITTED') {
      throw AppError.conflict('Your manager has already acted on this, so it can no longer be withdrawn.');
    }

    return applyTransition({ requests: this.requests, kinds: this.kinds, transactions: this.transactions }, request, {
      status: 'WITHDRAWN',
      decidedAt: new Date(),
      action: {
        action: 'WITHDRAW',
        authority: 'SUBMITTER',
        actorId: actor.id,
        actorRole: actor.role,
        comment: comment?.trim() || null,
        at: new Date(),
        resultingStatus: 'WITHDRAWN',
        cycle: request.cycle,
      },
    });
  }
}
