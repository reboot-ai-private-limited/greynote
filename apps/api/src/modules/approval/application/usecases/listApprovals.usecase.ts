import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { ApprovalRequest, ApprovalStatus } from '../../domain/approvalRequest.entity.js';
import type { ApprovalListFilter, ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';
import type { Actor } from '../../domain/approvalRules.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { ApprovalKindRegistry } from '../approvalKindRegistry.js';
import type { ConfigProviderPort } from '../../domain/configProvider.port.js';
import { canActOn, dueAt, loadPeople, loadSlaDays, loadSubjects, toListItem, type ApprovalListItem } from '../approvalViews.js';

const OPEN: ApprovalStatus[] = ['SUBMITTED', 'MANAGER_APPROVED'];
const DECIDED: ApprovalStatus[] = ['APPROVED', 'REJECTED', 'WITHDRAWN'];
/**
 * HR's queue is filtered in memory (whether a Stage-1 leave is top-of-chain needs each
 * submitter's manager), so its candidate set is capped. HR-kind requests open at once are a
 * few hundred at most; past this, the oldest are served first and the rest wait a page-turn.
 */
const IN_MEMORY_CAP = 2000;

export interface ApprovalQueryFilters {
  kind?: string | undefined;
  status?: ApprovalStatus | undefined;
  /** `/all` only: leave out what is still open, for a view of what has been decided. */
  decided?: boolean | undefined;
  submitterId?: string | undefined;
  /** Part of the submitter's name, employee code or email. */
  search?: string | undefined;
  /** Admin queue: only requests from this manager's direct reports (HLD 05 §5). */
  managerId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

/** The badge on the Team screen: what is waiting on the caller, in total and by kind. */
export interface InboxSummary {
  total: number;
  overdue: number;
  byKind: Array<{ kind: string; count: number; overdue: number }>;
}

/** A request still waiting on the submitter's manager (Stage 1) — what the Team alerts are built from. */
export interface WaitingOnManager {
  requestId: string;
  kind: string;
  recordId: string;
  cycle: number;
  submitterId: string;
  managerId: string;
  submittedAt: Date;
  dueAt: Date;
  overdue: boolean;
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
    private readonly config: ConfigProviderPort,
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
    const isManager = actor.role !== 'ADMIN' && actor.role !== 'HR';
    const reportIds = isManager ? (await this.users.getDirectReports(actor.id)).map((r) => r.id) : undefined;
    const common = await this.commonFilter(filters, reportIds);
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

    return this.page(actor, { ...common, statuses: ['SUBMITTED'] }, page, 'asc');
  }

  /**
   * Every request waiting at Stage 1 whose submitter has a manager, oldest first (at most `IN_MEMORY_CAP`), optionally of some kinds or
   * submitted since a time. A submitter with no manager goes straight to Admin, so is left out. For alerts, not for a screen.
   */
  async waitingOnManagers(filter: { kinds?: string[] | undefined; submittedFrom?: Date | undefined } = {}): Promise<WaitingOnManager[]> {
    const { items } = await this.requests.list({ statuses: ['SUBMITTED'], kinds: filter.kinds, submittedFrom: filter.submittedFrom }, { sortOrder: 'asc', pageSize: IN_MEMORY_CAP, page: 1 });
    const people = await loadPeople(this.users, items);
    const days = await loadSlaDays(this.config);
    const now = Date.now();
    return items.flatMap((r) => {
      const managerId = people.get(r.submitterId)?.managerId;
      const due = dueAt(r, days);
      if (!managerId || !due) return [];
      return [{ requestId: r.id, kind: r.kind, recordId: r.recordId, cycle: r.cycle, submitterId: r.submitterId, managerId, submittedAt: r.submittedAt, dueAt: due, overdue: now > due.getTime() }];
    });
  }

  /**
   * Counts of what `inbox` would list, so a phone can show a badge without paging. The kind counts read the oldest
   * `IN_MEMORY_CAP` rows; `total` is always the true number of open rows the inbox holds (HR's is the capped count).
   */
  async inboxSummary(actor: Actor): Promise<InboxSummary> {
    const { items, total } = await this.inbox(actor, {}, { page: 1, pageSize: IN_MEMORY_CAP });
    const byKind = new Map<string, { kind: string; count: number; overdue: number }>();
    for (const item of items) {
      const row = byKind.get(item.kind) ?? { kind: item.kind, count: 0, overdue: 0 };
      row.count += 1;
      if (item.overdue) row.overdue += 1;
      byKind.set(item.kind, row);
    }
    const rows = [...byKind.values()].sort((a, b) => a.kind.localeCompare(b.kind));
    return { total, overdue: rows.reduce((n, r) => n + r.overdue, 0), byKind: rows };
  }

  /**
   * Every request the caller may see in the portal, any status, newest first: the History tab, and the
   * only way to find an Approved request to reopen. Admin sees all of them (filterable like the inbox);
   * HR sees the kinds it is a final approver of (Leave), in any status. Managers use `team`.
   */
  async all(actor: Actor, filters: ApprovalQueryFilters, page: PageQuery): Promise<PaginatedResult<ApprovalListItem>> {
    const common = await this.commonFilter(filters);
    if (common === null) return buildPaginatedResult([], 0, page);
    const statuses = filters.status ? { statuses: [filters.status] } : filters.decided ? { statuses: DECIDED } : {};

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
    const common = await this.commonFilter(filters, inScope.map((m) => m.id));
    if (common === null) return buildPaginatedResult([], 0, page);
    return this.page(actor, { ...common, ...(filters.status && { statuses: [filters.status] }) }, page, 'desc');
  }

  /** The caller's own requests, newest first. */
  async mine(actor: Actor, filters: ApprovalQueryFilters, page: PageQuery): Promise<PaginatedResult<ApprovalListItem>> {
    const common = await this.commonFilter({ ...filters, submitterId: undefined, managerId: undefined, search: undefined });
    if (common === null) return buildPaginatedResult([], 0, page);
    return this.page(actor, { ...common, submitterIds: [actor.id], ...(filters.status && { statuses: [filters.status] }) }, page, 'desc');
  }

  /**
   * Kind / submitter / manager / search / date filters shared by every list. `scope` is who the caller may see at all (a manager's
   * reports, a downline); the submitter filters narrow it. Null = can match nothing.
   */
  private async commonFilter(filters: ApprovalQueryFilters, scope?: string[]): Promise<ApprovalListFilter | null> {
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
    if (scope) submitterIds = submitterIds ? submitterIds.filter((id) => scope.includes(id)) : scope;
    if (filters.search && submitterIds?.length !== 0) {
      const named = await this.users.findUserIdsByName(filters.search, submitterIds ? { restrictTo: submitterIds } : {});
      submitterIds = named;
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
    const sla = { days: await loadSlaDays(this.config), now: new Date() };
    const subjects = await loadSubjects(this.kinds, items);
    return buildPaginatedResult(
      items.map((r) => toListItem(r, actor, people, this.kinds, sla, subjects)),
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
    const sla = { days: await loadSlaDays(this.config), now: new Date() };
    const actionable = candidates.filter((r) => canActOn(r, actor, people.get(r.submitterId), this.kinds.find(r.kind)));
    const start = (page.page - 1) * page.pageSize;
    const shown = actionable.slice(start, start + page.pageSize);
    const subjects = await loadSubjects(this.kinds, shown);
    return buildPaginatedResult(
      shown.map((r) => toListItem(r, actor, people, this.kinds, sla, subjects)),
      actionable.length,
      page,
    );
  }
}
