import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { LeaveRepositoryPort } from '../../domain/leave.repository.port.js';
import type { LeaveView, LeaveViews } from '../leaveViews.js';

/** Newest first. `mine` is the caller's own; `all` is HR/Admin's view across employees. */
export class ListLeavesUseCase {
  constructor(
    private readonly leaves: LeaveRepositoryPort,
    private readonly views: LeaveViews,
  ) {}

  async mine(userId: string, range: { from?: string | undefined; to?: string | undefined }, page: { page: number; pageSize: number }) {
    return this.run({ userIds: [userId], ...range }, page);
  }

  async all(
    filter: { userId?: string | undefined; from?: string | undefined; to?: string | undefined },
    page: { page: number; pageSize: number },
  ): Promise<PaginatedResult<LeaveView>> {
    return this.run({ userIds: filter.userId ? [filter.userId] : undefined, from: filter.from, to: filter.to }, page);
  }

  private async run(
    filter: { userIds?: string[] | undefined; from?: string | undefined; to?: string | undefined },
    page: { page: number; pageSize: number },
  ): Promise<PaginatedResult<LeaveView>> {
    const { items, total } = await this.leaves.list(filter, page);
    return buildPaginatedResult(await this.views.many(items), total, page);
  }
}
