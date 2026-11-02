import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { LateGrant, NewLateGrant } from '../domain/lateGrant.entity.js';
import type { DirectoryUser, UserDirectoryPort } from '../domain/userDirectory.port.js';
import { PeriodLocks } from './periodLocks.js';
import { payrollLockGuard } from './standardGuards.js';
import { BulkGrantLateUseCase } from './usecases/bulkGrantLate.usecase.js';
import { GrantLateUseCase } from './usecases/grantLate.usecase.js';
import { ListEligibleUseCase } from './usecases/listEligible.usecase.js';

const id = (n: number) => `aaaaaaaaaaaaaaaaaaaaaaa${n}`;
const ADMIN = id(0), ASM = id(1), MR1 = id(2), MR2 = id(3), MR3 = id(4), OUTSIDER = id(5), INACTIVE = id(6);
const admin = { id: ADMIN, role: 'ADMIN' as const };

class Users implements UserDirectoryPort {
  rows: Array<DirectoryUser & { managerId?: string }> = [
    { id: ADMIN, name: 'a', role: 'ADMIN', status: 'active' },
    { id: ASM, name: 'asm', role: 'FIELD', status: 'active' },
    { id: MR1, name: 'mr1', role: 'FIELD', status: 'active', managerId: ASM },
    { id: MR2, name: 'mr2', role: 'FIELD', status: 'active', managerId: ASM },
    { id: MR3, name: 'mr3', role: 'FIELD', status: 'active', managerId: ASM },
    { id: OUTSIDER, name: 'out', role: 'FIELD', status: 'active' },
    { id: INACTIVE, name: 'gone', role: 'FIELD', status: 'inactive', managerId: ASM },
  ];
  async getUserSummaries(ids: string[]) { return this.rows.filter((r) => ids.includes(r.id)); }
  async getManagerChain(userId: string) {
    const out: DirectoryUser[] = [];
    let cur = this.rows.find((r) => r.id === userId)?.managerId;
    while (cur) { const u = this.rows.find((r) => r.id === cur)!; out.push(u); cur = u.managerId; }
    return out;
  }
  async getDownline(m: string): Promise<DirectoryUser[]> {
    const below = (x: string): DirectoryUser[] => this.rows.filter((r) => r.managerId === x).flatMap((r) => [r, ...below(r.id)]);
    return below(m);
  }
  async listActiveFieldUserIds() { return this.rows.filter((r) => r.role === 'FIELD' && r.status === 'active').map((r) => r.id); }
}

function setup(over: Record<string, string> = {}, locked: string[] = []) {
  const rows: LateGrant[] = [];
  const repo = {
    create: async (input: NewLateGrant, now: Date) => {
      if (rows.some((r) => r.userId === input.userId && r.kind === input.kind && r.periodKey === input.periodKey && r.status === 'OPEN' && r.expiresAt > now)) return null;
      const row: LateGrant = { ...input, id: `g${rows.length + 1}`, status: 'OPEN', usedAt: null, usedRef: null, revokedAt: null, revokedBy: null };
      rows.push(row);
      return row;
    },
  } as never;
  const users = new Users();
  const locks = new PeriodLocks();
  locks.bind(payrollLockGuard(async (u) => locked.includes(u)));
  const base: Record<string, string> = { BUSINESS_TIMEZONE: 'Asia/Kolkata', DAY_START_TIME: '00:00', FY_START_MONTH: 'APRIL', FY_CLOSED_YEARS: 'NONE', LATE_PLAN_GRANT_BY_MANAGER: 'false', ...over };
  const config = { get: async (k: string) => { if (base[k] === undefined) throw AppError.internal('INTERNAL', { reason: 'CONFIG_KEY_MISSING', key: k }); return base[k]; } };
  const single = new GrantLateUseCase(repo, users, locks, config, () => new Date('2026-11-02T06:00:00Z'));
  return { bulk: new BulkGrantLateUseCase(single), eligible: new ListEligibleUseCase(users), rows };
}

const input = { kind: 'MONTHLY_PLAN' as const, periodKey: '2026-10', reason: 'Network outage' };

describe('bulk late grants', () => {
  it('grants every employee and de-duplicates the list', async () => {
    const { bulk, rows } = setup();
    const r = await bulk.execute(admin, { ...input, userIds: [MR1, MR2, MR1] });
    expect(r.granted.map((g) => g.userId)).toEqual([MR1, MR2]);
    expect(r.skipped).toEqual([]);
    expect(rows).toHaveLength(2);
  });

  it('reports who was left out and why, and still grants the rest', async () => {
    const { bulk } = setup({}, [MR2]);
    await bulk.execute(admin, { ...input, userIds: [MR3] }); // MR3 now holds an open one
    const r = await bulk.execute(admin, { ...input, userIds: [MR1, MR2, MR3, INACTIVE, id(9)] });
    expect(r.granted.map((g) => g.userId)).toEqual([MR1]);
    expect(Object.fromEntries(r.skipped.map((s) => [s.userId, s.code]))).toEqual({
      [MR2]: 'GRANT_PERIOD_LOCKED',
      [MR3]: 'ALREADY_OPEN',
      [INACTIVE]: 'NOT_ELIGIBLE',
      [id(9)]: 'NOT_ELIGIBLE',
    });
    expect(r.skipped.every((s) => s.reason.length > 0)).toBe(true);
  });

  it('fails the whole request, writing nothing, when the period or end is wrong', async () => {
    const { bulk, rows } = setup();
    await expect(bulk.execute(admin, { ...input, periodKey: '2026-12', userIds: [MR1] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(bulk.execute(admin, { ...input, userIds: [MR1], expiresAt: new Date('2026-11-01T00:00:00Z') })).rejects.toMatchObject({ statusCode: 400 });
    await expect(bulk.execute(admin, { ...input, userIds: [] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(bulk.execute(admin, { ...input, userIds: Array.from({ length: 501 }, (_, i) => `a${i}`) })).rejects.toMatchObject({ statusCode: 400 });
    expect(rows).toHaveLength(0);
  });

  it('lets a manager grant for their team only, and reports the rest instead of failing', async () => {
    const { bulk } = setup({ LATE_PLAN_GRANT_BY_MANAGER: 'true' });
    const r = await bulk.execute({ id: ASM, role: 'FIELD' }, { ...input, userIds: [MR1, OUTSIDER] });
    expect(r.granted.map((g) => g.userId)).toEqual([MR1]);
    expect(r.skipped).toMatchObject([{ userId: OUTSIDER, code: 'FORBIDDEN' }]);
  });

  it('when managers may not grant, every employee is skipped as forbidden', async () => {
    const { bulk } = setup();
    const r = await bulk.execute({ id: ASM, role: 'FIELD' }, { ...input, userIds: [MR1, MR2] });
    expect(r.granted).toEqual([]);
    expect(r.skipped.map((s) => s.code)).toEqual(['FORBIDDEN', 'FORBIDDEN']);
  });

  it('a fault that is not about the employee is not swallowed', async () => {
    const { bulk } = setup({ BUSINESS_TIMEZONE: 'Not/AZone' });
    await expect(bulk.execute(admin, { ...input, userIds: [MR1] })).rejects.toBeInstanceOf(Error);
  });
});

describe('who a bulk exception can be aimed at', () => {
  it('Admin: everyone active, or one manager’s active team', async () => {
    const { eligible } = setup();
    expect(new Set(await eligible.execute(admin, { all: true }))).toEqual(new Set([ASM, MR1, MR2, MR3, OUTSIDER]));
    expect(await eligible.execute(admin, { managerId: ASM })).toEqual([MR1, MR2, MR3]);
    await expect(eligible.execute(admin, {})).rejects.toMatchObject({ statusCode: 400 });
  });

  it('a manager gets their own team only', async () => {
    const { eligible } = setup();
    const asm = { id: ASM, role: 'FIELD' as const };
    expect(await eligible.execute(asm, { managerId: ASM })).toEqual([MR1, MR2, MR3]);
    await expect(eligible.execute(asm, { all: true })).rejects.toMatchObject({ statusCode: 403 });
    await expect(eligible.execute(asm, { managerId: OUTSIDER })).rejects.toMatchObject({ statusCode: 403 });
  });
});
