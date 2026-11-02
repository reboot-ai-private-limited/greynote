import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import { effectiveGrantStatus, type LateGrant, type LateGrantKind, type LateGrantStatus } from '../../domain/lateGrant.entity.js';
import type { LateGrantRepositoryPort } from '../../domain/lateGrant.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../actor.js';

export interface ListLateFilter {
  userId?: string | undefined;
  kinds?: LateGrantKind[] | undefined;
  month?: string | undefined;
  status?: LateGrantStatus | undefined;
}

/** Newest first. Admin, HR and Accountant see everyone's; a field employee sees their own and their downline's. */
export class ListLateUseCase {
  constructor(
    private readonly grants: LateGrantRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly now: () => Date,
  ) {}

  async execute(actor: Actor, filter: ListLateFilter, page: { page: number; pageSize: number }): Promise<PaginatedResult<LateGrant>> {
    let userIds: string[] | undefined = filter.userId ? [filter.userId] : undefined;
    if (actor.role === 'FIELD') {
      const visible = new Set([actor.id, ...(await this.users.getDownline(actor.id)).map((u) => u.id)]);
      if (filter.userId && !visible.has(filter.userId)) throw AppError.forbidden();
      userIds ??= [...visible];
    }
    const { items, total } = await this.grants.list(
      { ...(userIds && { userIds }), ...(filter.kinds && { kinds: filter.kinds }), ...(filter.month && { month: filter.month }), ...(filter.status && { status: filter.status }), now: this.now() },
      page,
    );
    const now = this.now();
    return buildPaginatedResult(items.map((g) => ({ ...g, status: effectiveGrantStatus(g, now) })), total, page);
  }
}
