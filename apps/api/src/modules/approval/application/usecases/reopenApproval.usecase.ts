import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalRequest } from '../../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';
import type { Actor } from '../../domain/approvalRules.js';
import type { ApprovalKindRegistry } from '../approvalKindRegistry.js';
import { applyTransition } from '../applyTransition.js';

/**
 * Admin unlocks an approved request so the submitter can change the record and resubmit — the
 * override on "approved means locked" (decision-log 2026-09-24). A reason is required, and the
 * approval it undoes stays in the history.
 */
export class ReopenApprovalUseCase {
  constructor(
    private readonly requests: ApprovalRequestRepositoryPort,
    private readonly kinds: ApprovalKindRegistry,
    private readonly transactions: TransactionRunnerPort,
  ) {}

  async execute(requestId: string, actor: Actor, reason: string): Promise<ApprovalRequest> {
    if (actor.role !== 'ADMIN') throw AppError.forbidden('Only Admin can reopen an approved request.');
    const comment = reason.trim();
    if (comment === '') throw AppError.badRequest('A reason is required to reopen.', { field: 'comment' });

    const request = await this.requests.findById(requestId);
    if (!request) throw AppError.notFound();
    if (request.status !== 'APPROVED') throw AppError.conflict('Only an approved request can be reopened.');

    return applyTransition({ requests: this.requests, kinds: this.kinds, transactions: this.transactions }, request, {
      status: 'REOPENED',
      decidedAt: null,
      action: {
        action: 'REOPEN',
        authority: 'ADMIN_OVERRIDE',
        actorId: actor.id,
        actorRole: actor.role,
        comment,
        at: new Date(),
        resultingStatus: 'REOPENED',
        cycle: request.cycle,
      },
    });
  }
}
