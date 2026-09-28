import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import { effectiveGrantStatus, type LateSubmitGrant } from '../../domain/lateSubmitGrant.entity.js';
import type { LateSubmitGrantRepositoryPort } from '../../domain/lateSubmitGrant.repository.port.js';
import type { PlanKind } from '../../domain/plan.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../planAccess.js';

/**
 * Newest first. Admin sees everyone's; a field employee sees their own and their downline's —
 * that's the team a manager can grant for, and what an MR needs to see their own exception.
 */
export class ListLateSubmitGrantsUseCase {
  constructor(
    private readonly grants: LateSubmitGrantRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly now: () => Date,
  ) {}

  async execute(
    actor: Actor,
    filter: { userId?: string | undefined; kind?: PlanKind | undefined },
    page: { page: number; pageSize: number },
  ): Promise<PaginatedResult<LateSubmitGrant>> {
    let userIds: string[] | undefined = filter.userId ? [filter.userId] : undefined;
    if (actor.role !== 'ADMIN') {
      const visible = new Set([actor.id, ...(await this.users.getDownline(actor.id)).map((u) => u.id)]);
      if (filter.userId && !visible.has(filter.userId)) throw AppError.forbidden();
      userIds ??= [...visible];
    }
    const { items, total } = await this.grants.list({ ...(userIds && { userIds }), ...(filter.kind && { kind: filter.kind }) }, page);
    const now = this.now();
    return buildPaginatedResult(
      items.map((g) => ({ ...g, status: effectiveGrantStatus(g, now) })),
      total,
      page,
    );
  }
}
