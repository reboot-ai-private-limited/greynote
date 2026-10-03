import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { ApprovalRequest, ApprovalStatus } from '../../domain/approvalRequest.entity.js';
import type { ApprovalListFilter, ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';
import type { Actor } from '../../domain/approvalRules.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { ApprovalKindRegistry } from '../approvalKindRegistry.js';
import { canActOn, loadPeople, toListItem, type ApprovalListItem } from '../approvalViews.js';

const OPEN: ApprovalStatus[] = ['SUBMITTED', 'MANAGER_APPROVED'];
/**
 * HR's queue is filtered in memory (whether a Stage-1 leave is top-of-chain needs each
 * submitter's manager), so its candidate set is capped. HR-kind requests open at once are a
 * few hundred at most; past this, the oldest are served first and the rest wait a page-turn.
 */
const IN_MEMORY_CAP = 2000;

export interface ApprovalQueryFilters {
  kind?: string | undefined;
  status?: ApprovalStatus | undefined;
  submitterId?: string | undefined;
  /** Admin queue: only requests from this manager's direct reports (HLD 05 §5). */
  managerId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

export interface PageQuery {
  page: number;
  pageSize: number;
}

/**
 * The approval screens' lists. All return the same row shape with a `canAct` flag, so the
 * web portal and the app's Team tab render one component (client rules §19.6).
 */
export class ListApprovalsUseCase {
  constructor(
    private readonly requests: ApprovalRequestRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly kinds: ApprovalKindRegistry,
  ) {}

  /**
   * What the caller can approve or reject now, longest-waiting first.
   * - A manager: their direct reports' requests at Stage 1.
   * - HR: open requests of HR kinds (Leave) that HR can act on — Manager-approved, or from a
   *   submitter with no manager.
   * - Admin: every open request (Admin can act on all of them), filterable — the org-wide
   *   queue of HLD 05 §5.
   */
  async inbox(actor: Actor, filters: ApprovalQueryFilters, page: PageQuery): Promise<PaginatedResult<ApprovalListItem>> {
    const common = await this.commonFilter(filters);
    if (common === null) return buildPaginatedResult([], 0, page);

    if (actor.role === 'ADMIN') {
      const statuses = filters.status ? [filters.status].filter((s) => OPEN.includes(s)) : OPEN;
      return this.page(actor, { ...common, statuses }, page, 'asc');
    }

    if (actor.role === 'HR') {
      const hrKinds = this.kinds.kindsWithFinalApprover('HR');
      const kinds = filters.kind ? hrKinds.filter((k) => k === filters.kind) : hrKinds;
      if (kinds.length === 0) return buildPaginatedResult([], 0, page);
      const { items } = await this.requests.list({ ...common, kinds, statuses: OPEN }, { sortOrder: 'asc', pageSize: IN_MEMORY_CAP, page: 1 });
      return this.filterInMemory(actor, items, page);
    }

    const reports = await this.users.getDirectReports(actor.id);
    const reportIds = reports.map((r) => r.id);
    const submitterIds = filters.submitterId ? reportIds.filter((id) => id === filters.submitterId) : reportIds;
    if (submitterIds.length === 0) return buildPaginatedResult([], 0, page);
    return this.page(actor, { ...common, submitterIds, statuses: ['SUBMITTED'] }, page, 'asc');
  }

  /**
   * Every request the caller may see in the portal, any status, newest first: the History tab, and the
   * only way to find an Approved request to reopen. Admin sees all of them (filterable like the inbox);
   * HR sees the kinds it is a final approver of (Leave), in any status. Managers use `team`.
   */
  async all(actor: Actor, filters: ApprovalQueryFilters, page: PageQuery): Promise<PaginatedResult<ApprovalListItem>> {
    const common = await this.commonFilter(filters);
    if (common === null) return buildPaginatedResult([], 0, page);
    const statuses = filters.status ? { statuses: [filters.status] } : {};

    if (actor.role === 'ADMIN') return this.page(actor, { ...common, ...statuses }, page, 'desc');

    if (actor.role === 'HR') {
      const hrKinds = this.kinds.kindsWithFinalApprover('HR');
      const kinds = filters.kind ? hrKinds.filter((k) => k === filters.kind) : hrKinds;
      if (kinds.length === 0) return buildPaginatedResult([], 0, page);
      return this.page(actor, { ...common, ...statuses, kinds }, page, 'desc');
    }
    throw AppError.forbidden();
  }

  /**
   * A manager's downline, any status, newest first. Direct reports' Stage-1 requests come back
   * with `canAct: true`; everything deeper is read-only (PRD §7.1.3).
   */
  async team(
    actor: Actor,
    scope: 'direct' | 'indirect' | 'all',
    filters: ApprovalQueryFilters,
    page: PageQuery,
  ): Promise<PaginatedResult<ApprovalListItem>> {
    const downline = await this.users.getDownline(actor.id);
    const inScope = downline.filter((m) => (scope === 'direct' ? m.depth === 1 : scope === 'indirect' ? m.depth > 1 : true));
    let submitterIds = inScope.map((m) => m.id);
    if (filters.submitterId) submitterIds = submitterIds.filter((id) => id === filters.submitterId);
    const common = await this.commonFilter({ ...filters, submitterId: undefined });
    if (common === null || submitterIds.length === 0) return buildPaginatedResult([], 0, page);
    return this.page(actor, { ...common, submitterIds, ...(filters.status && { statuses: [filters.status] }) }, page, 'desc');
  }

  /** The caller's own requests, newest first. */
  async mine(actor: Actor, filters: ApprovalQueryFilters, page: PageQuery): Promise<PaginatedResult<ApprovalListItem>> {
    const common = await this.commonFilter({ ...filters, submitterId: undefined, managerId: undefined });
    if (common === null) return buildPaginatedResult([], 0, page);
    return this.page(actor, { ...common, submitterIds: [actor.id], ...(filters.status && { statuses: [filters.status] }) }, page, 'desc');
  }

  /** Kind / submitter / manager / date filters shared by every list. Null = can match nothing. */
  private async commonFilter(filters: ApprovalQueryFilters): Promise<ApprovalListFilter | null> {
    if (filters.from && filters.to && filters.from > filters.to) {
      throw AppError.badRequest('The end of the date range is before its start.', { field: 'to' });
    }
    const filter: ApprovalListFilter = {
      ...(filters.kind && { kinds: [filters.kind] }),
      ...(filters.from && { submittedFrom: filters.from }),
      ...(filters.to && { submittedTo: filters.to }),
    };
    let submitterIds = filters.submitterId ? [filters.submitterId] : undefined;
    if (filters.managerId) {
      const reportIds = (await this.users.getDirectReports(filters.managerId)).map((r) => r.id);
      submitterIds = submitterIds ? submitterIds.filter((id) => reportIds.includes(id)) : reportIds;
    }
    if (submitterIds) {
      if (submitterIds.length === 0) return null;
      filter.submitterIds = submitterIds;
    }
    return filter;
  }

  private async page(
    actor: Actor,
    filter: ApprovalListFilter,
    page: PageQuery,
    sortOrder: 'asc' | 'desc',
  ): Promise<PaginatedResult<ApprovalListItem>> {
    const { items, total } = await this.requests.list(filter, { ...page, sortOrder });
    const people = await loadPeople(this.users, items);
    return buildPaginatedResult(
      items.map((r) => toListItem(r, actor, people, this.kinds)),
      total,
      page,
    );
  }

  private async filterInMemory(
    actor: Actor,
    candidates: ApprovalRequest[],
    page: PageQuery,
  ): Promise<PaginatedResult<ApprovalListItem>> {
    const people = await loadPeople(this.users, candidates);
    const actionable = candidates.filter((r) => canActOn(r, actor, people.get(r.submitterId), this.kinds.find(r.kind)));
    const start = (page.page - 1) * page.pageSize;
    return buildPaginatedResult(
      actionable.slice(start, start + page.pageSize).map((r) => toListItem(r, actor, people, this.kinds)),
      actionable.length,
      page,
    );
  }
}
