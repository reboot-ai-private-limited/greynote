import type { ApprovalRequest, ApprovalStatus } from '@/modules/approval/approval.public.js';
import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalKindDefinition } from '@/modules/approval/approval.public.js';
import type { DailyPlanChange } from '../../domain/dailyPlanChange.entity.js';
import { OpenChangeExistsError, type DailyPlanChangeRepositoryPort } from '../../domain/dailyPlanChange.repository.port.js';
import { makeDailyPlanChangeHandler } from '../dailyPlanChangeHandler.js';
import { makeMonthlyPlanInheritHandler } from '../monthlyPlanInheritHandler.js';
import { AmendDailyPlanUseCase } from './amendDailyPlan.usecase.js';
import { GetDailyPlanChangeUseCase, ListDailyPlanChangesUseCase } from './listDailyPlanChanges.usecase.js';
import { RequestDailyPlanChangeUseCase } from './requestDailyPlanChange.usecase.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlan, PlanAmendment } from '../../domain/dailyPlan.entity.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { LateSubmitGrant } from '../../domain/lateSubmitGrant.entity.js';
import type { LateSubmitGrantFilter, LateSubmitGrantRepositoryPort } from '../../domain/lateSubmitGrant.repository.port.js';
import type { MonthlyPlan, MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import type { PlanDay, PlanKind } from '../../domain/plan.js';
import type { DirectoryUser, UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { PlanDeadlines } from '../planDeadlines.js';
import { PlanSubmitter } from '../planSubmitter.js';
import { PlanViews } from '../planViews.js';

/** In-memory fakes for Planning's use-case tests — no Mongo, no other module's internals. */

export class FakeDailyPlans implements DailyPlanRepositoryPort {
  rows = new Map<string, DailyPlan>();
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findByUserAndDate(userId: string, planDate: string) {
    return [...this.rows.values()].find((p) => p.userId === userId && p.planDate === planDate) ?? null;
  }
  async listForUser(userId: string, from: string, to: string) {
    return [...this.rows.values()]
      .filter((p) => p.userId === userId && p.planDate >= from && p.planDate <= to)
      .sort((a, b) => a.planDate.localeCompare(b.planDate));
  }
  async save(userId: string, planDate: string, day: PlanDay, expectedRevision: number | null) {
    const existing = await this.findByUserAndDate(userId, planDate);
    if ((existing?.revision ?? null) !== expectedRevision) return null;
    const plan: DailyPlan = {
      id: existing?.id ?? `plan-${this.rows.size + 1}`,
      userId,
      planDate,
      ...day,
      revision: (existing?.revision ?? 0) + 1,
      lateResubmits: existing?.lateResubmits ?? 0,
      source: existing?.source ?? 'MANUAL',
      amendments: existing?.amendments ?? [],
      updatedAt: new Date(),
    };
    this.rows.set(plan.id, plan);
    return plan;
  }
  async createInherited(userId: string, planDate: string, day: PlanDay) {
    if (await this.findByUserAndDate(userId, planDate)) return false;
    const id = `plan-${this.rows.size + 1}`;
    this.rows.set(id, { id, userId, planDate, ...day, source: 'MONTHLY', amendments: [], revision: 1, lateResubmits: 0, updatedAt: new Date() });
    return true;
  }
  async amend(id: string, expectedRevision: number, day: PlanDay, amendment: PlanAmendment) {
    const plan = this.rows.get(id);
    if (!plan || plan.revision !== expectedRevision) return null;
    const next = { ...plan, ...day, revision: plan.revision + 1, amendments: [...plan.amendments, amendment], updatedAt: amendment.at };
    this.rows.set(id, next);
    return next;
  }
  async applyChange(id: string, revision: number, day: PlanDay) {
    const plan = this.rows.get(id);
    if (!plan || plan.revision !== revision) return false;
    this.rows.set(id, { ...plan, ...day, revision: revision + 1, updatedAt: new Date() });
    return true;
  }
  async confirmRevision(id: string, revision: number, countLateResubmit: boolean) {
    const plan = this.rows.get(id);
    if (!plan || plan.revision !== revision) return false;
    this.rows.set(id, { ...plan, revision: revision + 1, lateResubmits: plan.lateResubmits + (countLateResubmit ? 1 : 0) });
    return true;
  }
}

export class FakeChanges implements DailyPlanChangeRepositoryPort {
  rows: DailyPlanChange[] = [];
  async findById(id: string) {
    return this.rows.find((c) => c.id === id) ?? null;
  }
  async listForPlan(planId: string) {
    return this.rows.filter((c) => c.planId === planId).reverse();
  }
  async countApplied(planId: string) {
    return this.rows.filter((c) => c.planId === planId && c.applied).length;
  }
  async create(input: Omit<DailyPlanChange, 'id' | 'open' | 'applied' | 'createdAt'>) {
    // Check and insert in one synchronous step, like the partial unique index does.
    if (this.rows.some((c) => c.planId === input.planId && c.open)) throw new OpenChangeExistsError();
    const row: DailyPlanChange = { ...input, id: `change-${this.rows.length + 1}`, open: true, applied: false, createdAt: new Date() };
    this.rows.push(row);
    return row;
  }
  async close(id: string, applied: boolean) {
    const row = this.rows.find((c) => c.id === id)!;
    row.open = false;
    row.applied = applied;
  }
}

export class FakeMonthlyPlans implements MonthlyPlanRepositoryPort {
  rows = new Map<string, MonthlyPlan>();
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async findByUserAndMonth(userId: string, planMonth: string) {
    return [...this.rows.values()].find((p) => p.userId === userId && p.planMonth === planMonth) ?? null;
  }
  async listForUser(userId: string, fromMonth: string, toMonth: string) {
    return [...this.rows.values()]
      .filter((p) => p.userId === userId && p.planMonth >= fromMonth && p.planMonth <= toMonth)
      .sort((a, b) => a.planMonth.localeCompare(b.planMonth));
  }
  async listFromMonth(planMonth: string) {
    return [...this.rows.values()].filter((p) => p.planMonth >= planMonth);
  }
  async save(userId: string, planMonth: string, entries: MonthlyPlanEntry[], expectedRevision: number | null) {
    const existing = await this.findByUserAndMonth(userId, planMonth);
    if ((existing?.revision ?? null) !== expectedRevision) return null;
    const plan: MonthlyPlan = {
      id: existing?.id ?? `month-${this.rows.size + 1}`,
      userId,
      planMonth,
      entries,
      revision: (existing?.revision ?? 0) + 1,
      lateResubmits: existing?.lateResubmits ?? 0,
      updatedAt: new Date(),
    };
    this.rows.set(plan.id, plan);
    return plan;
  }
  async confirmRevision(id: string, revision: number, countLateResubmit: boolean) {
    const plan = this.rows.get(id);
    if (!plan || plan.revision !== revision) return false;
    this.rows.set(id, { ...plan, revision: revision + 1, lateResubmits: plan.lateResubmits + (countLateResubmit ? 1 : 0) });
    return true;
  }
}

export class FakeGrants implements LateSubmitGrantRepositoryPort {
  rows = new Map<string, LateSubmitGrant>();
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  private usable(g: LateSubmitGrant, now: Date) {
    return g.status === 'OPEN' && g.expiresAt > now;
  }
  async findUsable(userId: string, kind: PlanKind, planKey: string, now: Date) {
    return (
      [...this.rows.values()].find(
        (g) => g.userId === userId && g.kind === kind && g.planKey === planKey && this.usable(g, now),
      ) ?? null
    );
  }
  async create(input: Omit<LateSubmitGrant, 'id' | 'status' | 'usedAt' | 'revokedAt' | 'revokedBy'>, now: Date) {
    const same = [...this.rows.values()].filter(
      (g) => g.userId === input.userId && g.kind === input.kind && g.planKey === input.planKey && g.status === 'OPEN',
    );
    for (const g of same) if (g.expiresAt <= now) this.rows.set(g.id, { ...g, status: 'EXPIRED' });
    if (same.some((g) => g.expiresAt > now)) return null;
    const grant: LateSubmitGrant = { ...input, id: `grant-${this.rows.size + 1}`, status: 'OPEN', usedAt: null, revokedAt: null, revokedBy: null };
    this.rows.set(grant.id, grant);
    return grant;
  }
  async consume(id: string, now: Date) {
    const g = this.rows.get(id);
    if (!g || !this.usable(g, now)) return false;
    this.rows.set(id, { ...g, status: 'USED', usedAt: now });
    return true;
  }
  async revoke(id: string, revokedBy: string, now: Date) {
    const g = this.rows.get(id);
    if (!g || !this.usable(g, now)) return null;
    const revoked = { ...g, status: 'REVOKED' as const, revokedAt: now, revokedBy };
    this.rows.set(id, revoked);
    return revoked;
  }
  async list(filter: LateSubmitGrantFilter, page: { page: number; pageSize: number }) {
    const matches = [...this.rows.values()]
      .filter((g) => (!filter.userIds || filter.userIds.includes(g.userId)) && (!filter.kind || filter.kind === g.kind))
      .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime());
    return { items: matches.slice((page.page - 1) * page.pageSize, page.page * page.pageSize), total: matches.length };
  }
}

/** Just enough of the approval module: submit/resubmit, and a way to set a decision. */
export class FakeApprovals implements ApprovalsPort {
  requests = new Map<string, ApprovalRequest>();
  registered: string[] = [];
  definitions = new Map<string, ApprovalKindDefinition>();
  registerKind(definition: ApprovalKindDefinition) {
    this.registered.push(definition.kind);
    this.definitions.set(definition.kind, definition);
  }
  /**
   * Like the approval module: runs the kind's `onStatusChange` first and only moves the request if
   * it doesn't throw (the real one rolls the decision back).
   */
  async decide(kind: string, recordId: string, status: ApprovalStatus) {
    const request = this.requests.get(`${kind}:${recordId}`);
    if (!request) throw new Error('no request');
    const next = { ...request, status };
    await this.definitions.get(kind)?.onStatusChange?.(
      { requestId: request.id, kind, recordId, submitterId: request.submitterId, previousStatus: request.status, status, action: {} as never, request: next },
      {},
    );
    this.setStatus(kind, recordId, status);
  }
  async submit(input: { kind: string; recordId: string; submitterId: string }) {
    const key = `${input.kind}:${input.recordId}`;
    const existing = this.requests.get(key);
    if (existing && !isEditableBySubmitter(existing.status)) throw AppError.conflict('Already waiting.');
    const request: ApprovalRequest = {
      id: existing?.id ?? `req-${this.requests.size + 1}`,
      kind: input.kind,
      recordId: input.recordId,
      submitterId: input.submitterId,
      status: 'SUBMITTED',
      workflow: 'MANAGER_THEN_FINAL',
      cycle: (existing?.cycle ?? 0) + 1,
      submittedAt: new Date(),
      decidedAt: null,
      history: [],
    };
    this.requests.set(key, request);
    return request;
  }
  async getForRecord(kind: string, recordId: string) {
    return this.requests.get(`${kind}:${recordId}`) ?? null;
  }
  /** A decision at `at`; a rejection is appended to the history, where the resubmit window reads it. */
  setStatus(kind: string, recordId: string, status: ApprovalStatus, at = new Date()) {
    const request = this.requests.get(`${kind}:${recordId}`);
    if (!request) throw new Error('no request');
    const history =
      status === 'REJECTED'
        ? [
            ...request.history,
            {
              action: 'REJECT' as const,
              authority: 'MANAGER' as const,
              actorId: 'manager',
              actorRole: 'FIELD' as const,
              comment: 'no',
              at,
              resultingStatus: status,
              cycle: request.cycle,
            },
          ]
        : request.history;
    this.requests.set(`${kind}:${recordId}`, { ...request, status, history });
  }
}

export class FakeUsers implements UserDirectoryPort {
  users = new Map<string, DirectoryUser & { managerId: string | null; isBlocked: boolean }>();
  add(id: string, opts: { role?: DirectoryUser['role']; managerId?: string | null; status?: DirectoryUser['status'] } = {}) {
    this.users.set(id, {
      id,
      name: id,
      role: opts.role ?? 'FIELD',
      status: opts.status ?? 'active',
      managerId: opts.managerId ?? null,
      isBlocked: false,
    });
  }
  async getUserSummaries(ids: string[]) {
    return ids.flatMap((id) => this.users.get(id) ?? []);
  }
  async getManagerChain(userId: string) {
    const chain: DirectoryUser[] = [];
    let managerId = this.users.get(userId)?.managerId ?? null;
    while (managerId) {
      const manager = this.users.get(managerId);
      if (!manager) break;
      chain.push(manager);
      managerId = manager.managerId;
    }
    return chain;
  }
  async getDownline(managerId: string) {
    const below: DirectoryUser[] = [];
    const walk = (id: string) => {
      for (const u of this.users.values()) {
        if (u.managerId === id) {
          below.push(u);
          walk(u.id);
        }
      }
    };
    walk(managerId);
    return below;
  }
  async isBlocked(userId: string) {
    return this.users.get(userId)?.isBlocked ?? false;
  }
}

export class FakeRoutes {
  byUser = new Map<string, string[]>();
  /** Runs while the submit is validating — to interleave a concurrent edit. */
  onList: (() => Promise<void>) | undefined;
  async listRoutesForUser(userId: string) {
    await this.onList?.();
    return (this.byUser.get(userId) ?? []).map((id) => ({ id }));
  }
}

export class FakeConfig {
  values: Record<string, string> = {
    BUSINESS_TIMEZONE: 'Asia/Kolkata', DAY_START_TIME: '00:00',
    DAILY_PLAN_SUBMIT_CUTOFF_TIME: '10:00',
    MONTHLY_PLAN_SUBMIT_CUTOFF_DATE: '28',
    LATE_PLAN_GRANT_BY_MANAGER: 'false',
    LATE_PLAN_GRANT_VALID_HOURS: '24',
    DAILY_PLAN_RESUBMIT_GRACE_MINUTES: '30',
    DAILY_PLAN_RESUBMIT_LATEST_TIME: '11:30',
    MONTHLY_PLAN_RESUBMIT_GRACE_HOURS: '24',
    PLAN_RESUBMIT_GRACE_MAX: '2',
    DAILY_PLAN_CHANGE_MAX: '3',
  };
  async get(key: string) {
    const value = this.values[key];
    if (value === undefined) throw new Error(`missing ${key}`);
    return value;
  }
}

export const inlineTransactions: TransactionRunnerPort = { run: (fn) => fn({}) };

/** A settable clock. */
export class Clock {
  constructor(public current: Date) {}
  now = () => this.current;
  set(iso: string) {
    this.current = new Date(iso);
  }
}

export function planningKit(clock: Clock) {
  const users = new FakeUsers();
  const routes = new FakeRoutes();
  const approvals = new FakeApprovals();
  const config = new FakeConfig();
  const dailyPlans = new FakeDailyPlans();
  const monthlyPlans = new FakeMonthlyPlans();
  const grants = new FakeGrants();
  const deadlines = new PlanDeadlines(config, clock.now);
  const views = new PlanViews(approvals, grants, deadlines);
  const submitter = new PlanSubmitter(users, routes, approvals, grants, inlineTransactions, clock.now);
  const changes = new FakeChanges();
  approvals.registerKind({
    kind: 'DAILY_PLAN_CHANGE',
    finalApproverRoles: ['ADMIN'],
    managerOnly: true,
    onStatusChange: makeDailyPlanChangeHandler(changes, dailyPlans, approvals, deadlines),
  });
  approvals.registerKind({
    kind: 'MONTHLY_PLAN',
    finalApproverRoles: ['ADMIN'],
    onStatusChange: makeMonthlyPlanInheritHandler(monthlyPlans, dailyPlans, approvals, deadlines),
  });
  /** Dates (`userId:YYYY-MM-DD`) whose DCR the test says is already submitted. */
  const reported = new Set<string>();
  const amend = new AmendDailyPlanUseCase(dailyPlans, users, submitter, deadlines, views, () => async (u, d) => reported.has(`${u}:${d}`));
  const requestChange = new RequestDailyPlanChangeUseCase(dailyPlans, changes, approvals, users, submitter, deadlines, inlineTransactions);
  const listChanges = new ListDailyPlanChangesUseCase(dailyPlans, changes, approvals, users);
  const getChange = new GetDailyPlanChangeUseCase(changes, approvals, users);
  return { users, routes, approvals, config, dailyPlans, monthlyPlans, grants, deadlines, views, submitter, changes, requestChange, listChanges, getChange, amend, reported };
}
