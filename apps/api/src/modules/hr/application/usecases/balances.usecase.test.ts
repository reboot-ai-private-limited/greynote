import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { proratedAllocation } from '../../domain/leaveBalance.entity.js';
import { DEFAULT_LEAVE_TYPES } from '../../domain/leaveType.entity.js';
import { HrCalendar } from '../hrCalendar.js';
import { LeaveBalances } from '../leaveBalances.js';
import { AdjustLeaveBalanceUseCase } from './adjustLeaveBalance.usecase.js';
import { GetLeaveBalancesUseCase } from './getLeaveBalances.usecase.js';
import { Clock, FakeBalances, FakeConfig, FakeLeaveTypes, FakePolicies, FakeUsers } from './hrTestKit.js';

const FY2026 = { from: '2026-04-01', to: '2027-03-31' };

async function expectStatus(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

describe('proratedAllocation', () => {
  it('gives the full days to someone who joined before the year, none after it', () => {
    expect(proratedAllocation(12, FY2026, null)).toBe(12);
    expect(proratedAllocation(12, FY2026, '2020-06-01')).toBe(12);
    expect(proratedAllocation(12, FY2026, '2026-04-01')).toBe(12);
    expect(proratedAllocation(12, FY2026, '2027-04-01')).toBe(0);
  });

  it('gives a mid-year joiner the share for the months from their joining month, in half days', () => {
    expect(proratedAllocation(12, FY2026, '2026-07-15')).toBe(9); // Jul–Mar = 9 months
    expect(proratedAllocation(15, FY2026, '2026-07-15')).toBe(11.5); // 11.25 → 11.5
    expect(proratedAllocation(12, FY2026, '2027-03-31')).toBe(1);
  });
});

describe('Leave balances', () => {
  let types: FakeLeaveTypes;
  let policies: FakePolicies;
  let balanceRepo: FakeBalances;
  let users: FakeUsers;
  let get: GetLeaveBalancesUseCase;
  let adjust: AdjustLeaveBalanceUseCase;

  const typeId = (name: string) => types.rows.find((t) => t.name === name)!.id;
  const setDays = (band: string, name: string, days: number) =>
    policies.upsert({ payBandId: band, leaveTypeId: typeId(name), defaultDays: days, updatedBy: 'hr' });
  const days = async (userId: string, year?: number) =>
    Object.fromEntries((await get.execute({ id: 'hr', role: 'HR' }, userId, year)).balances.map((b) => [b.leaveTypeName, b.allocatedDays]));

  beforeEach(async () => {
    types = new FakeLeaveTypes();
    await types.seed(DEFAULT_LEAVE_TYPES);
    policies = new FakePolicies();
    balanceRepo = new FakeBalances();
    users = new FakeUsers();
    users.add('asm');
    users.add('mr', { managerId: 'asm', dateOfJoining: '2020-01-10' });
    users.add('new', { dateOfJoining: '2026-07-15' });
    users.add('noband', { payBandId: null });
    users.add('stranger');
    const calendar = new HrCalendar(new FakeConfig(), new Clock(new Date('2026-09-28T06:00:00Z')).now);
    const balances = new LeaveBalances(balanceRepo, policies, types, users, calendar);
    get = new GetLeaveBalancesUseCase(balances, users, calendar);
    adjust = new AdjustLeaveBalanceUseCase(balanceRepo, balances);
    await setDays('band-g1', 'Casual', 12);
    await setDays('band-g1', 'Sick', 6);
  });

  it('seeds the current leave year on first read — paid types only, 0 where no default is set', async () => {
    const result = await get.execute({ id: 'mr', role: 'FIELD' }, 'mr');
    expect(result.year).toBe(2026);
    expect(Object.fromEntries(result.balances.map((b) => [b.leaveTypeName, [b.allocatedDays, b.availableDays]]))).toEqual({
      Casual: [12, 12],
      Earned: [0, 0],
      Sick: [6, 6],
    });
  });

  it('never creates balances when a leave year that is already over is read — it shows only what exists', async () => {
    expect(await days('mr', 2025)).toEqual({});
    expect(balanceRepo.rows).toEqual([]); // nothing was written
    await balanceRepo.insertMissing([{ userId: 'mr', leaveTypeId: typeId('Casual'), year: 2025, allocatedDays: 10 }]);
    expect(await days('mr', 2025)).toEqual({ Casual: 10 }); // history that exists is shown, and only that
    expect(balanceRepo.rows.filter((b) => b.year === 2025).length).toBe(1);
    expect((await days('mr')).Casual).toBe(12); // the current year still seeds on first read
  });

  it('pro-rates a mid-year joiner', async () => {
    expect(await days('new')).toEqual({ Casual: 9, Earned: 0, Sick: 4.5 });
  });

  it('has no balances without a Pay Band', async () => {
    expect(await days('noband')).toEqual({});
  });

  it('keeps a seeded balance when the Leave Master changes later, and seeds the next year from the new value', async () => {
    await days('mr');
    await setDays('band-g1', 'Casual', 15);
    expect((await days('mr')).Casual).toBe(12);
    expect((await days('mr', 2027)).Casual).toBe(15);
  });

  it('lets the employee, their managers, HR and Admin read — nobody else', async () => {
    await expect(get.execute({ id: 'asm', role: 'FIELD' }, 'mr')).resolves.toBeDefined();
    await expect(get.execute({ id: 'admin', role: 'ADMIN' }, 'mr')).resolves.toBeDefined();
    await expectStatus(get.execute({ id: 'stranger', role: 'FIELD' }, 'mr'), 403);
  });

  it('lets HR adjust one person’s allocation, never below used + pending, and only for paid types', async () => {
    const input = { userId: 'mr', leaveTypeId: typeId('Casual'), year: 2026, reason: 'top-up', actorId: 'hr' };
    expect((await adjust.execute({ ...input, allocatedDays: 14 })).availableDays).toBe(14);
    await balanceRepo.reserve({ userId: 'mr', leaveTypeId: typeId('Casual'), year: 2026 }, 3, {});
    await balanceRepo.consume({ userId: 'mr', leaveTypeId: typeId('Casual'), year: 2026 }, 3, {});
    await balanceRepo.reserve({ userId: 'mr', leaveTypeId: typeId('Casual'), year: 2026 }, 2, {});
    await expectStatus(adjust.execute({ ...input, allocatedDays: 4.5 }), 409);
    expect((await adjust.execute({ ...input, allocatedDays: 5 })).availableDays).toBe(0);
    await expectStatus(adjust.execute({ ...input, leaveTypeId: typeId('Loss of Pay'), allocatedDays: 5 }), 400);
    await expectStatus(adjust.execute({ ...input, userId: 'noband', allocatedDays: 5 }), 400);
    expect((await days('asm')).Casual).toBe(12); // untouched Leave Master default for others
  });
});
