import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalRequest } from '../../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';
import type { Actor } from '../../domain/approvalRules.js';
import type { ApprovalKindRegistry } from '../approvalKindRegistry.js';
import { applyTransition } from '../applyTransition.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';

/**
 * Admin unlocks an approved request so the submitter can change the record and resubmit — the
 * override on "approved means locked" (decision-log 2026-09-24). A reason is required, and the
 * approval it undoes stays in the history. For a kind that says `managerReopen` (the Tour Plan, 2026-11-19) a field manager above the
 * submitter may do it too, never for their own request.
 */
export class ReopenApprovalUseCase {
  constructor(
    private readonly requests: ApprovalRequestRepositoryPort,
    private readonly kinds: ApprovalKindRegistry,
    private readonly transactions: TransactionRunnerPort,
    private readonly users?: UserDirectoryPort,
  ) {}

  async execute(requestId: string, actor: Actor, reason: string, duration?: '30m' | '1h' | '12h'): Promise<ApprovalRequest> {
    const comment = reason.trim();
    if (comment === '') throw AppError.badRequest('A reason is required to reopen.', { field: 'comment' });

    const request = await this.requests.findById(requestId);
    if (!request) throw AppError.notFound();
    const kind = this.kinds.find(request.kind);
    if (actor.role !== 'ADMIN' && !(await this.managerMayReopen(kind?.managerReopen === true, request.submitterId, actor))) {
      throw AppError.forbidden('You cannot reopen this request.');
    }
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
        ...(duration ? { reopenDuration: duration } : {}),
      },
    });
  }

  /** A field manager above the submitter (any level), never the submitter themselves. */
  private async managerMayReopen(allowed: boolean, submitterId: string, actor: Actor): Promise<boolean> {
    if (!allowed || !this.users || actor.role !== 'FIELD' || actor.id === submitterId) return false;
    return (await this.users.getManagerChain(submitterId)).some((m) => m.id === actor.id);
  }
}
