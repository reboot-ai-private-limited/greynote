import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { LateGrant, NewLateGrant } from '../domain/lateGrant.entity.js';
import type { LateGrantFilter, LateGrantRepositoryPort } from '../domain/lateGrant.repository.port.js';
import type { DirectoryUser, UserDirectoryPort } from '../domain/userDirectory.port.js';
import { LateGrantGate } from './lateGrantGate.js';
import { PeriodLocks } from './periodLocks.js';
import { expenseLockGuard, payrollLockGuard, type ExpenseMonthState } from './standardGuards.js';
import { GrantLateUseCase } from './usecases/grantLate.usecase.js';
import { ListLateUseCase } from './usecases/listLate.usecase.js';
import { RevokeLateUseCase } from './usecases/revokeLate.usecase.js';

const ADMIN = 'aaaaaaaaaaaaaaaaaaaaaaa0';
const MR = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const OTHER = 'aaaaaaaaaaaaaaaaaaaaaaa3';

const admin = { id: ADMIN, role: 'ADMIN' as const };
const field = (id: string) => ({ id, role: 'FIELD' as const });

class MemoryGrants implements LateGrantRepositoryPort {
  rows: LateGrant[] = [];
  private seq = 0;
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async findUsable(userId: string, kind: LateGrant['kind'], periodKey: string, now: Date) {
    return this.rows.find((r) => r.userId === userId && r.kind === kind && r.periodKey === periodKey && r.status === 'OPEN' && r.expiresAt > now) ?? null;
  }
  async create(input: NewLateGrant, now: Date) {
    for (const r of this.rows) if (r.userId === input.userId && r.kind === input.kind && r.periodKey === input.periodKey && r.status === 'OPEN' && r.expiresAt <= now) r.status = 'EXPIRED';
    if (this.rows.some((r) => r.userId === input.userId && r.kind === input.kind && r.periodKey === input.periodKey && r.status === 'OPEN')) return null;
    const row: LateGrant = { ...input, id: `g${++this.seq}`, status: 'OPEN', usedAt: null, usedRef: null, revokedAt: null, revokedBy: null };
    this.rows.push(row);
    return row;
  }
  async consume(id: string, now: Date, usedRef: string | null) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || r.status !== 'OPEN' || r.expiresAt <= now) return false;
    Object.assign(r, { status: 'USED', usedAt: now, usedRef });
    return true;
  }
  async revoke(id: string, by: string, now: Date) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || r.status !== 'OPEN' || r.expiresAt <= now) return null;
    Object.assign(r, { status: 'REVOKED', revokedAt: now, revokedBy: by });
    return r;
  }
  async listUsable(kinds: LateGrant['kind'][], prefix: string, now: Date) {
    return this.rows.filter((r) => kinds.includes(r.kind) && r.periodKey.startsWith(prefix) && r.status === 'OPEN' && r.expiresAt > now);
  }
  async closeOpenForPeriod(userId: string, kinds: LateGrant['kind'][], prefix: string, now: Date) {
    let n = 0;
    for (const r of this.rows) if (r.userId === userId && kinds.includes(r.kind) && r.periodKey.startsWith(prefix) && r.status === 'OPEN') { r.status = 'EXPIRED'; r.expiresAt = now; n++; }
    return n;
  }
  async list(filter: LateGrantFilter, page: { page: number; pageSize: number }) {
    const items = this.rows.filter((r) => (!filter.userIds || filter.userIds.includes(r.userId)) && (!filter.kinds || filter.kinds.includes(r.kind)) && (!filter.month || r.periodKey.startsWith(filter.month)) && (!filter.status || r.status === filter.status));
    return { items: items.slice((page.page - 1) * page.pageSize, page.page * page.pageSize), total: items.length };
  }
}

class Users implements UserDirectoryPort {
  private users = new Map<string, DirectoryUser & { managerId?: string }>();
  add(id: string, role: DirectoryUser['role'] = 'FIELD', managerId?: string, status: DirectoryUser['status'] = 'active') {
    this.users.set(id, { id, name: id, role, status, ...(managerId && { managerId }) });
  }
  async getUserSummaries(ids: string[]) { return ids.flatMap((i) => (this.users.has(i) ? [this.users.get(i)!] : [])); }
  async listActiveFieldUserIds() { return [...this.users.values()].filter((u) => u.role === 'FIELD' && u.status === 'active').map((u) => u.id); }
  async getManagerChain(id: string) {
    const out: DirectoryUser[] = [];
    let cur = this.users.get(id)?.managerId;
    while (cur) { const u = this.users.get(cur)!; out.push(u); cur = (u as { managerId?: string }).managerId; }
    return out;
  }
  async getDownline(id: string) {
    const all = [...this.users.values()];
    const below = (m: string): DirectoryUser[] => all.filter((u) => u.managerId === m).flatMap((u) => [u, ...below(u.id)]);
    return below(id);
  }
}

const config = (over: Record<string, string> = {}) => ({
  get: async (key: string) => {
    const base: Record<string, string> = { BUSINESS_TIMEZONE: 'Asia/Kolkata', DAY_START_TIME: '00:00', FY_START_MONTH: 'APRIL', FY_CLOSED_YEARS: 'NONE', LATE_PLAN_GRANT_BY_MANAGER: 'false', LATE_PLAN_GRANT_VALID_HOURS: '24', LATE_PLAN_GRANT_MAX_HOURS: '744', LATE_EXPENSE_GRANT_BY_MANAGER: 'false', ...over };
    const v = base[key];
    if (v === undefined) throw AppError.internal('INTERNAL', { reason: 'CONFIG_KEY_MISSING', key });
    return v;
  },
});

async function refused(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(status);
  if (code) expect((err as AppError).code).toBe(code);
}

describe('Late grants', () => {
  let now: Date;
  let repo: MemoryGrants;
  let users: Users;
  let locks: PeriodLocks;
  let payrollFinal: Set<string>;
  let expenseState: Record<string, ExpenseMonthState>;
  const clock = () => now;
  const build = (over: Record<string, string> = {}) => ({
    grant: new GrantLateUseCase(repo, users, locks, config(over), clock),
    revoke: new RevokeLateUseCase(repo, clock),
    list: new ListLateUseCase(repo, users, clock),
    gate: new LateGrantGate(repo, locks, clock),
  });

  beforeEach(() => {
    now = new Date('2026-11-02T06:00:00Z'); // 11:30 IST, 2 Nov
    repo = new MemoryGrants();
    users = new Users();
    users.add(ADMIN, 'ADMIN');
    users.add(ASM);
    users.add(MR, 'FIELD', ASM);
    users.add(OTHER);
    locks = new PeriodLocks();
    payrollFinal = new Set();
    expenseState = {};
    locks.bind(payrollLockGuard(async (u, m) => payrollFinal.has(`${u}:${m}`)));
    locks.bind(expenseLockGuard(async (u, m) => expenseState[`${u}:${m}`] ?? { submitted: false, finalized: false, hasPaid: false }));
  });

  it('grants every kind with its own period format and default length', async () => {
    const { grant } = build();
    const daily = await grant.execute(admin, { userId: MR, kind: 'DAILY_PLAN', periodKey: '2026-11-02', reason: 'x' });
    expect(daily.expiresAt.toISOString()).toBe('2026-11-02T18:29:59.999Z'); // capped to the end of the business day
    const stock = await grant.execute(admin, { userId: MR, kind: 'MONTHLY_STOCK', periodKey: '2026-10', reason: 'x' });
    expect(stock.expiresAt.getTime() - now.getTime()).toBe(72 * 3_600_000);
    const exp = await grant.execute(admin, { userId: MR, kind: 'EXPENSE_SUBMIT', periodKey: '2026-10', reason: 'x' });
    expect(exp.expiresAt.getTime() - now.getTime()).toBe(24 * 3_600_000);
  });

  it('rejects malformed periods, future periods and non-field employees', async () => {
    const { grant } = build();
    await refused(grant.execute(admin, { userId: MR, kind: 'DAILY_PLAN', periodKey: '2026-11', reason: 'x' }), 400);
    await refused(grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-13', reason: 'x' }), 400);
    await refused(grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-12', reason: 'x' }), 400);
    await refused(grant.execute(admin, { userId: ADMIN, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' }), 400);
  });

  it('refuses a day that is already over for a daily plan', async () => {
    const { grant } = build();
    await refused(grant.execute(admin, { userId: MR, kind: 'DAILY_PLAN', periodKey: '2026-10-30', reason: 'x' }), 400);
  });

  it('refuses a plan once the month’s payroll is finalized, and says why', async () => {
    const { grant } = build();
    payrollFinal.add(`${MR}:2026-10`);
    await refused(grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' }), 409, 'GRANT_PERIOD_LOCKED');
    // another month, and another employee, are untouched
    await grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-11', reason: 'x' });
  });

  it('refuses plans and expenses once the expense month is paid or finalized, but not merely sent', async () => {
    const { grant } = build();
    expenseState[`${MR}:2026-10`] = { submitted: true, finalized: false, hasPaid: false };
    await grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' });
    expenseState[`${MR}:2026-10`] = { submitted: true, finalized: true, hasPaid: false };
    await refused(grant.execute(admin, { userId: MR, kind: 'EXPENSE_APPROVE', periodKey: '2026-10', reason: 'x' }), 409, 'GRANT_PERIOD_LOCKED');
    expenseState[`${MR}:2026-10`] = { submitted: true, finalized: false, hasPaid: true };
    await refused(grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' }), 409, 'GRANT_PERIOD_LOCKED');
  });

  it('does not lock the stock kinds on payroll or expenses', async () => {
    const { grant } = build();
    payrollFinal.add(`${MR}:2026-10`);
    expenseState[`${MR}:2026-10`] = { submitted: true, finalized: true, hasPaid: true };
    await grant.execute(admin, { userId: MR, kind: 'MONTHLY_STOCK', periodKey: '2026-10', reason: 'x' });
  });

  it('refuses a period in a closed financial year', async () => {
    const { grant } = build({ FY_CLOSED_YEARS: '2025' });
    await refused(grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-03', reason: 'x' }), 409);
  });

  it('allows one open grant per employee, kind and period', async () => {
    const { grant } = build();
    await grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' });
    await refused(grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'again' }), 409);
    await grant.execute(admin, { userId: MR, kind: 'EXPENSE_SUBMIT', periodKey: '2026-10', reason: 'different kind' });
  });

  it('lets a manager grant for their team only while the kind’s setting is on', async () => {
    await refused(build().grant.execute(field(ASM), { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' }), 403);
    const on = build({ LATE_PLAN_GRANT_BY_MANAGER: 'true' });
    await on.grant.execute(field(ASM), { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' });
    await refused(on.grant.execute(field(ASM), { userId: OTHER, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' }), 403);
    // the plan setting doesn't open the expense kinds
    await refused(on.grant.execute(field(ASM), { userId: MR, kind: 'EXPENSE_SUBMIT', periodKey: '2026-10', reason: 'x' }), 403);
  });

  it('checks a custom end: future, and within the kind’s longest', async () => {
    const { grant } = build();
    await refused(grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x', expiresAt: new Date('2026-11-01T00:00:00Z') }), 400);
    await refused(grant.execute(admin, { userId: MR, kind: 'EXPENSE_SUBMIT', periodKey: '2026-10', reason: 'x', expiresAt: new Date('2026-11-20T00:00:00Z') }), 400); // > 168h
    await refused(grant.execute(admin, { userId: MR, kind: 'DAILY_PLAN', periodKey: '2026-11-02', reason: 'x', expiresAt: new Date('2026-11-04T00:00:00Z') }), 400); // past the day
  });

  it('a daily report is let through late by Admin only, for a day already over, and not past a finalized payroll', async () => {
    const { grant } = build({ LATE_PLAN_GRANT_BY_MANAGER: 'true' }); // the plan setting never opens a report
    const g = await grant.execute(admin, { userId: MR, kind: 'DCR_SUBMIT', periodKey: '2026-10-05', reason: 'was on a trip', expiresAt: new Date('2026-11-04T00:00:00Z') });
    expect(g).toMatchObject({ kind: 'DCR_SUBMIT', periodKey: '2026-10-05', grantedByRole: 'ADMIN' }); // ends after the day: the day-end cap is for plans
    await refused(grant.execute(field(ASM), { userId: MR, kind: 'DCR_SUBMIT', periodKey: '2026-10-06', reason: 'x' }), 403);
    await refused(grant.execute(admin, { userId: MR, kind: 'DCR_SUBMIT', periodKey: '2026-10', reason: 'x' }), 400); // named by its date
    payrollFinal.add(`${MR}:2026-09`);
    await refused(grant.execute(admin, { userId: MR, kind: 'DCR_SUBMIT', periodKey: '2026-09-30', reason: 'x' }), 409);
  });

  it('the gate finds a usable grant, spends it once, and treats a newly locked period as no grant', async () => {
    const { grant, gate } = build();
    await grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' });
    const found = await gate.findUsable(MR, 'MONTHLY_PLAN', '2026-10');
    expect(found).not.toBeNull();
    payrollFinal.add(`${MR}:2026-10`);
    expect(await gate.findUsable(MR, 'MONTHLY_PLAN', '2026-10')).toBeNull();
    await refused(gate.consume(found!, 'plan1'), 409, 'GRANT_PERIOD_LOCKED');
    payrollFinal.clear();
    await gate.consume(found!, 'plan1');
    expect(repo.rows[0]).toMatchObject({ status: 'USED', usedRef: 'plan1' });
    await refused(gate.consume(found!, 'plan1'), 409);
    expect(await gate.findUsable(MR, 'MONTHLY_PLAN', '2026-10')).toBeNull();
  });

  it('closeForPeriod ends every open grant of a month, daily ones included', async () => {
    const { grant, gate } = build();
    await grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' });
    await grant.execute(admin, { userId: MR, kind: 'EXPENSE_SUBMIT', periodKey: '2026-10', reason: 'x' });
    await grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-11', reason: 'x' });
    expect(await gate.closeForPeriod(MR, ['MONTHLY_PLAN', 'DAILY_PLAN'], '2026-10')).toBe(1);
    expect(await gate.findUsable(MR, 'MONTHLY_PLAN', '2026-10')).toBeNull();
    expect(await gate.findUsable(MR, 'EXPENSE_SUBMIT', '2026-10')).not.toBeNull();
  });

  it('revokes by Admin or the grantor only, and only while open', async () => {
    const on = build({ LATE_PLAN_GRANT_BY_MANAGER: 'true' });
    const g = await on.grant.execute(field(ASM), { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' });
    await refused(on.revoke.execute(field(OTHER), g.id), 403);
    await on.revoke.execute(field(ASM), g.id);
    await refused(on.revoke.execute(admin, g.id), 409);
    await refused(on.revoke.execute(admin, 'nope'), 404);
  });

  it('lists everything for Admin, and a field user’s own and team’s only; expired reads as expired', async () => {
    const { grant, list } = build();
    await grant.execute(admin, { userId: MR, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' });
    await grant.execute(admin, { userId: OTHER, kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'x' });
    expect((await list.execute(admin, {}, { page: 1, pageSize: 20 })).items).toHaveLength(2);
    expect((await list.execute(field(ASM), {}, { page: 1, pageSize: 20 })).items.map((g) => g.userId)).toEqual([MR]);
    await refused(list.execute(field(ASM), { userId: OTHER }, { page: 1, pageSize: 20 }), 403);
    now = new Date('2026-11-10T00:00:00Z');
    expect((await list.execute(admin, {}, { page: 1, pageSize: 20 })).items.every((g) => g.status === 'EXPIRED')).toBe(true);
  });
});
