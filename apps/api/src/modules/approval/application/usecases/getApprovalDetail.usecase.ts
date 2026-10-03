import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalAction } from '../../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';
import type { Actor } from '../../domain/approvalRules.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { ApprovalKindRegistry } from '../approvalKindRegistry.js';
import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import { canActOn, loadPeople, loadSlaDays, toListItem, toPersonRef, type ApprovalListItem, type PersonRef } from '../approvalViews.js';

export type ApprovalDetail = ApprovalListItem & {
  history: Array<Omit<ApprovalAction, 'actorId'> & { actor: PersonRef | null }>;
  canWithdraw: boolean;
  canReopen: boolean;
};

/**
 * One request with its full, named history and what the caller may do with it. Visible to the
 * submitter, everyone in the submitter's manager chain (the approver and the read-only levels
 * above), Admin, and the kind's other final approvers (HR for Leave). Anyone else gets 404, so
 * the id doesn't even confirm the request exists.
 */
export class GetApprovalDetailUseCase {
  constructor(
    private readonly requests: ApprovalRequestRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly kinds: ApprovalKindRegistry,
    private readonly config: ConfigProviderPort,
  ) {}

  async execute(requestId: string, actor: Actor): Promise<ApprovalDetail> {
    const request = await this.requests.findById(requestId);
    if (!request) throw AppError.notFound();

    const kind = this.kinds.find(request.kind);
    const canSee =
      actor.id === request.submitterId ||
      actor.role === 'ADMIN' ||
      (kind?.finalApproverRoles.includes(actor.role) ?? false) ||
      (await this.users.getManagerChain(request.submitterId)).some((m) => m.id === actor.id);
    if (!canSee) throw AppError.notFound();

    const people = await loadPeople(this.users, [request]);
    return {
      ...toListItem(request, actor, people, this.kinds, { days: await loadSlaDays(this.config), now: new Date() }),
      canAct: canActOn(request, actor, people.get(request.submitterId), kind),
      history: request.history.map(({ actorId, ...rest }) => ({ ...rest, actor: toPersonRef(people.get(actorId)) })),
      canWithdraw: actor.id === request.submitterId && request.status === 'SUBMITTED',
      canReopen: actor.role === 'ADMIN' && request.status === 'APPROVED',
    };
  }
}
