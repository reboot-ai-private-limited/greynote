import { AppError } from '@/shared/errors/AppError.js';
import { isOpen, type ApprovalRequest, type ApprovalStatus } from '../../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';
import { resolveAuthority, statusAfterApproval, type Actor } from '../../domain/approvalRules.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { ApprovalKindRegistry } from '../approvalKindRegistry.js';

export interface DecideApprovalInput {
  requestId: string;
  actor: Actor;
  decision: 'APPROVE' | 'REJECT';
  comment?: string | null | undefined;
}

/** Approve or reject, as whichever authority `resolveAuthority` grants the actor right now. */
export class DecideApprovalUseCase {
  constructor(
    private readonly requests: ApprovalRequestRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly kinds: ApprovalKindRegistry,
  ) {}

  async execute(input: DecideApprovalInput): Promise<ApprovalRequest> {
    const request = await this.requests.findById(input.requestId);
    if (!request) throw AppError.notFound();
    if (!isOpen(request.status)) throw AppError.conflict(`This request is already ${request.status.toLowerCase()}.`);

    const comment = input.comment?.trim() || null;
    if (input.decision === 'REJECT' && comment === null) {
      throw AppError.badRequest('A reason is required to reject.', { field: 'comment' });
    }

    // Live, not snapshotted: whoever manages the submitter NOW is the Stage-1 approver. A
    // submitter who has since been deleted has no manager, so the final approvers can still act.
    const submitter = await this.users.findUserSummary(request.submitterId);
    const authority = resolveAuthority(request, input.actor, submitter?.managerId ?? null, this.kinds.get(request.kind));
    if (!authority) throw AppError.forbidden('You cannot approve or reject this request.');

    const status: ApprovalStatus =
      input.decision === 'REJECT' ? 'REJECTED' : statusAfterApproval(authority, request.workflow);
    const now = new Date();

    const updated = await this.requests.transition(request.id, request.status, {
      status,
      decidedAt: isOpen(status) ? null : now,
      action: {
        action: input.decision,
        authority,
        actorId: input.actor.id,
        actorRole: input.actor.role,
        comment,
        at: now,
        resultingStatus: status,
      },
    });
    if (!updated) throw AppError.conflict('Someone else acted on this request first. Reload it.');
    return updated;
  }
}
