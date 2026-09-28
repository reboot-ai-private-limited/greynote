import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { DEFAULT_LEAVE_TYPES } from '../../domain/leaveType.entity.js';
import { HolidayCalendar } from '../holidayCalendar.js';
import { HrCalendar } from '../hrCalendar.js';
import { LeaveBalances } from '../leaveBalances.js';
import { makeLeaveLedger } from '../leaveLedger.js';
import { LeaveLookups } from '../leaveLookups.js';
import { LeaveRequests, type LeaveInput } from '../leaveRequests.js';
import { LeaveViews } from '../leaveViews.js';
import { GetLeaveUseCase } from './getLeave.usecase.js';
import {
  Clock,
  FakeApprovals,
  FakeBalances,
  FakeConfig,
  FakeHolidays,
  FakeLeaves,
  FakeLeaveTypes,
  FakePolicies,
  FakeTerritory,
  FakeUsers,
  inlineTransactions,
} from './hrTestKit.js';
import { UpdateLeaveTypeUseCase } from './updateLeaveType.usecase.js';

// Today is Mon 28 Sep 2026 (IST); leave year 2026 runs Apr 2026 – Mar 2027. Sun 4 Oct; Zone
// holiday Fri 2 Oct.
const NOW = new Date('2026-09-28T06:00:00Z');

async function expectError(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
  return err as AppError;
}

describe('Leave requests', () => {
  let types: FakeLeaveTypes;
  let balanceRepo: FakeBalances;
  let leaves: FakeLeaves;
  let approvals: FakeApprovals;
  let users: FakeUsers;
  let requests: LeaveRequests;
  let lookups: LeaveLookups;
  let get: GetLeaveUseCase;

  const typeId = (name: string) => types.rows.find((t) => t.name === name)!.id;
  const casual = (overrides: Partial<LeaveInput> = {}): LeaveInput => ({
    leaveTypeId: typeId('Casual'),
    startDate: '2026-10-01',
    endDate: '2026-10-06',
    half: null,
    reason: 'family',
    ...overrides,
  });
  const balance = (userId = 'mr', name = 'Casual') =>
    balanceRepo.rows.find((b) => b.userId === userId && b.leaveTypeId === typeId(name) && b.year === 2026)!;
  const ledger = (userId = 'mr') => {
    const b = balance(userId);
    return { used: b.usedDays, pending: b.pendingDays };
  };

  beforeEach(async () => {
    types = new FakeLeaveTypes();
    await types.seed(DEFAULT_LEAVE_TYPES);
    const policies = new FakePolicies();
    await policies.upsert({ payBandId: 'band-g1', leaveTypeId: typeId('Casual'), defaultDays: 6, updatedBy: 'hr' });
    balanceRepo = new FakeBalances();
    leaves = new FakeLeaves();
    approvals = new FakeApprovals();
    users = new FakeUsers();
    users.add('asm');
    users.add('mr', { managerId: 'asm' });
    users.add('noband', { payBandId: null });
    users.add('stranger');
    const territory = new FakeTerritory();
    territory.userHq.set('mr', { hqId: 'hq-slg', zoneId: 'zone-wb' });
    const holidays = new FakeHolidays();
    await holidays.create({ name: 'Durga Puja', date: '2026-10-02', scope: 'ZONE', zoneIds: ['zone-wb'], hqIds: [], createdBy: 'hr' });
    const calendar = new HrCalendar(new FakeConfig(), new Clock(NOW).now);
    const balances = new LeaveBalances(balanceRepo, policies, types, users, calendar);
    const views = new LeaveViews(approvals, types);
    approvals.registerKind({ kind: 'LEAVE', finalApproverRoles: ['HR', 'ADMIN'], onStatusChange: makeLeaveLedger(leaves, balanceRepo) });
    requests = new LeaveRequests(leaves, types, balanceRepo, balances, calendar, new HolidayCalendar(holidays, territory), approvals, inlineTransactions, views);
    lookups = new LeaveLookups(leaves, approvals);
    get = new GetLeaveUseCase(leaves, users, views);
  });

  it('counts working days only — skipping Sunday and the Zone holiday — and reserves them', async () => {
    const leave = await requests.request('mr', casual());
    expect(leave.days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-06']);
    expect(leave.daysCount).toBe(4);
    expect(leave.status).toBe('SUBMITTED');
    expect(leave.leaveTypeName).toBe('Casual');
    expect(ledger()).toEqual({ used: 0, pending: 4 });
  });

  it('counts a half day as 0.5, and only on a one-day leave', async () => {
    expect((await requests.request('mr', casual({ startDate: '2026-10-05', endDate: '2026-10-05', half: 'FIRST' }))).daysCount).toBe(0.5);
    await expectError(requests.request('mr', casual({ half: 'FIRST' })), 400);
    // The other half of the same day doesn't clash.
    expect((await requests.request('mr', casual({ startDate: '2026-10-05', endDate: '2026-10-05', half: 'SECOND' }))).daysCount).toBe(0.5);
  });

  it('allows up to 30 days back, this leave year or the next, never across a year boundary', async () => {
    await expectError(requests.request('mr', casual({ startDate: '2026-08-28', endDate: '2026-08-28' })), 400);
    expect((await requests.request('mr', casual({ startDate: '2026-08-29', endDate: '2026-08-29' }))).daysCount).toBe(1);
    await expectError(requests.request('mr', casual({ startDate: '2027-03-31', endDate: '2027-04-01' })), 400);
    await expectError(requests.request('mr', casual({ startDate: '2028-04-03', endDate: '2028-04-03' })), 400);
    await expectError(requests.request('mr', casual({ startDate: '2026-10-04', endDate: '2026-10-04' })), 400); // a Sunday only
  });

  it('refuses leave over dates already requested, but not over a rejected one', async () => {
    const first = await requests.request('mr', casual({ startDate: '2026-10-05', endDate: '2026-10-05' }));
    await expectError(requests.request('mr', casual({ startDate: '2026-10-05', endDate: '2026-10-06' })), 409);
    await approvals.move('LEAVE', first.id, 'REJECTED');
    expect((await requests.request('mr', casual({ startDate: '2026-10-05', endDate: '2026-10-06' }))).daysCount).toBe(2);
  });

  it('won’t overdraw: pending days count against the balance', async () => {
    await requests.request('mr', casual()); // 4 of 6
    const err = await expectError(requests.request('mr', casual({ startDate: '2026-10-07', endDate: '2026-10-09' })), 409);
    expect(err.publicDetails).toMatchObject({ available: 2, needed: 3 });
    expect((await requests.request('mr', casual({ startDate: '2026-10-07', endDate: '2026-10-08' }))).daysCount).toBe(2);
  });

  it('needs a Pay Band for paid leave, but Loss of Pay needs no balance', async () => {
    await expectError(requests.request('noband', casual()), 400);
    const lop = await requests.request('noband', casual({ leaveTypeId: typeId('Loss of Pay') }));
    expect(lop.isPaid).toBe(false);
    expect(balanceRepo.rows.filter((b) => b.userId === 'noband')).toHaveLength(0);
  });

  it('moves the ledger with each decision', async () => {
    const leave = await requests.request('mr', casual());
    await approvals.move('LEAVE', leave.id, 'MANAGER_APPROVED');
    expect(ledger()).toEqual({ used: 0, pending: 4 });
    await approvals.move('LEAVE', leave.id, 'APPROVED');
    expect(ledger()).toEqual({ used: 4, pending: 0 });
    await approvals.move('LEAVE', leave.id, 'REOPENED');
    expect(ledger()).toEqual({ used: 0, pending: 0 });

    // Edit the reopened leave to two days → reserved again and resubmitted.
    const edited = await requests.edit('mr', leave.id, casual({ startDate: '2026-10-05', endDate: '2026-10-06' }));
    expect(edited.status).toBe('SUBMITTED');
    expect(edited.approval?.cycle).toBe(2);
    expect(ledger()).toEqual({ used: 0, pending: 2 });

    await approvals.move('LEAVE', leave.id, 'WITHDRAWN');
    expect(ledger()).toEqual({ used: 0, pending: 0 });
  });

  it('only lets a returned leave be edited, by its owner', async () => {
    const leave = await requests.request('mr', casual());
    await expectError(requests.edit('mr', leave.id, casual()), 409);
    await approvals.move('LEAVE', leave.id, 'REJECTED');
    await expectError(requests.edit('asm', leave.id, casual()), 404);
    expect((await requests.edit('mr', leave.id, casual({ reason: 'fixed' }))).reason).toBe('fixed');
  });

  it('tells Phase 6 whether a day is covered, and Payroll the unpaid days in a month', async () => {
    const paid = await requests.request('mr', casual());
    expect(await lookups.isOnLeave('mr', '2026-10-01')).toBe(false); // only submitted
    await approvals.move('LEAVE', paid.id, 'MANAGER_APPROVED');
    expect(await lookups.isOnLeave('mr', '2026-10-01')).toBe(true);
    expect(await lookups.isOnLeave('mr', '2026-10-04')).toBe(false); // the Sunday isn't a leave day

    const lop = await requests.request('mr', casual({ leaveTypeId: typeId('Loss of Pay'), startDate: '2026-10-30', endDate: '2026-11-03' }));
    await approvals.move('LEAVE', lop.id, 'APPROVED');
    expect(await lookups.unpaidDays('mr', '2026-10')).toBe(2); // Fri 30, Sat 31
    expect(await lookups.unpaidDays('mr', '2026-11')).toBe(2); // Sun 1 off; Mon 2, Tue 3
  });

  it('locks a leave type’s isPaid once a leave uses it', async () => {
    await requests.request('noband', casual({ leaveTypeId: typeId('Loss of Pay') }));
    const update = new UpdateLeaveTypeUseCase(types, (id) => leaves.existsForLeaveType(id));
    await expectError(update.execute(typeId('Loss of Pay'), { isPaid: true }), 409);
  });

  it('lets the employee, their managers, HR and Admin read a leave', async () => {
    const leave = await requests.request('mr', casual());
    await expect(get.execute({ id: 'asm', role: 'FIELD' }, leave.id)).resolves.toBeDefined();
    await expect(get.execute({ id: 'hr', role: 'HR' }, leave.id)).resolves.toBeDefined();
    await expectError(get.execute({ id: 'stranger', role: 'FIELD' }, leave.id), 403);
  });
});
