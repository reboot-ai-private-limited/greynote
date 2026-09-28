import type { ApprovalRequest, ApprovalStatus } from '@/modules/approval/approval.public.js';
import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlan } from '../../domain/dailyPlan.entity.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { MonthlyPlan, MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import type { PlanDay } from '../../domain/plan.js';
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
      updatedAt: new Date(),
    };
    this.rows.set(plan.id, plan);
    return plan;
  }
  async confirmRevision(id: string, revision: number) {
    const plan = this.rows.get(id);
    if (!plan || plan.revision !== revision) return false;
    this.rows.set(id, { ...plan, revision: revision + 1 });
    return true;
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
  async save(userId: string, planMonth: string, entries: MonthlyPlanEntry[], expectedRevision: number | null) {
    const existing = await this.findByUserAndMonth(userId, planMonth);
    if ((existing?.revision ?? null) !== expectedRevision) return null;
    const plan: MonthlyPlan = {
      id: existing?.id ?? `month-${this.rows.size + 1}`,
      userId,
      planMonth,
      entries,
      revision: (existing?.revision ?? 0) + 1,
      updatedAt: new Date(),
    };
    this.rows.set(plan.id, plan);
    return plan;
  }
  async confirmRevision(id: string, revision: number) {
    const plan = this.rows.get(id);
    if (!plan || plan.revision !== revision) return false;
    this.rows.set(id, { ...plan, revision: revision + 1 });
    return true;
  }
}

/** Just enough of the approval module: submit/resubmit, and a way to set a decision. */
export class FakeApprovals implements ApprovalsPort {
  requests = new Map<string, ApprovalRequest>();
  registered: string[] = [];
  registerKind(definition: { kind: string }) {
    this.registered.push(definition.kind);
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
  setStatus(kind: string, recordId: string, status: ApprovalStatus) {
    const request = this.requests.get(`${kind}:${recordId}`);
    if (!request) throw new Error('no request');
    this.requests.set(`${kind}:${recordId}`, { ...request, status });
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
    BUSINESS_TIMEZONE: 'Asia/Kolkata',
    DAILY_PLAN_SUBMIT_CUTOFF_TIME: '10:00',
    MONTHLY_PLAN_SUBMIT_CUTOFF_DATE: '28',
    LATE_PLAN_GRANT_BY_MANAGER: 'false',
    LATE_PLAN_GRANT_VALID_HOURS: '24',
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
  const deadlines = new PlanDeadlines(config, clock.now);
  const views = new PlanViews(approvals, deadlines);
  const submitter = new PlanSubmitter(users, routes, approvals, inlineTransactions, clock.now);
  return { users, routes, approvals, config, dailyPlans, monthlyPlans, deadlines, views, submitter };
}
