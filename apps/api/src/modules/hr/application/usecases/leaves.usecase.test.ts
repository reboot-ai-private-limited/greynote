import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { DEFAULT_LEAVE_TYPES } from '../../domain/leaveType.entity.js';
import { HolidayCalendar } from '../holidayCalendar.js';
import { HrCalendar } from '../hrCalendar.js';
import { Probation } from '../probation.js';
import { LeaveBalances } from '../leaveBalances.js';
import { ExpireLateLeaves } from '../expireLateLeaves.js';
import { LeaveApprovalCutoff } from '../leaveApprovalCutoff.js';
import { makeLeaveLedger } from '../leaveLedger.js';
import { LeaveLock } from '../leaveLock.js';
import { LeaveLookups } from '../leaveLookups.js';
import { LeaveRequests, type LeaveInput } from '../leaveRequests.js';
import { LeaveViews } from '../leaveViews.js';
import { GetLeaveUseCase } from './getLeave.usecase.js';
import {
  Clock,
  FakeApprovals,
  FakeLeaveApprovalGrants,
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
  let config: FakeConfig;
  let lock: LeaveLock;
  let cutoff: LeaveApprovalCutoff;
  let grants: FakeLeaveApprovalGrants;
  const finalizedMonths = new Set<string>();
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
    await holidays.create({ name: 'Durga Puja', date: '2026-10-02', scope: 'ZONE', zoneIds: ['zone-wb'], hqIds: [], groupId: null, createdBy: 'hr' });
    config = new FakeConfig();
    const calendar = new HrCalendar(config, new Clock(NOW).now);
    const probation = new Probation(users, config, calendar);
    lock = new LeaveLock(config);
    finalizedMonths.clear();
    lock.bind(async (userId, month) => finalizedMonths.has(`${userId}:${month}`));
    const balances = new LeaveBalances(balanceRepo, policies, types, users, calendar);
    const views = new LeaveViews(approvals, types);
    grants = new FakeLeaveApprovalGrants();
    cutoff = new LeaveApprovalCutoff(leaves, grants, calendar, config, new Clock(NOW).now);
    approvals.registerKind({ kind: 'LEAVE', finalApproverRoles: ['HR', 'ADMIN'], onStatusChange: makeLeaveLedger(leaves, balanceRepo, lock, cutoff) });
    requests = new LeaveRequests(leaves, types, balanceRepo, balances, calendar, new HolidayCalendar(holidays, territory), approvals, inlineTransactions, views, probation, lock);
    lookups = new LeaveLookups(leaves, approvals, probation, types);
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

  it('also skips the 1st and 3rd Saturday once the schedule says so', async () => {
    config.values['WEEKLY_OFF_SCHEDULE'] = '[{"effectiveFrom":"1970-01-01","rules":[{"weekday":"SUNDAY","weeks":"ALL"},{"weekday":"SATURDAY","weeks":[1,3]}]}]';
    // 3 Oct 2026 is the 1st Saturday: off, so the leave counts 1, 5 and 6 Oct (2 Oct is the holiday, 4 Oct a Sunday).
    const leave = await requests.request('mr', casual());
    expect(leave.days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-05', '2026-10-06']);
    await expectError(requests.request('mr', casual({ startDate: '2026-10-03', endDate: '2026-10-03' })), 400);
  });

  it('refuses a half-day leave: leaves are whole days (2026-10-05)', async () => {
    await expectError(requests.request('mr', casual({ startDate: '2026-10-05', endDate: '2026-10-05', half: 'FIRST' })), 400);
    expect((await requests.request('mr', casual({ startDate: '2026-10-05', endDate: '2026-10-05' }))).daysCount).toBe(1);
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

  it('lists the covered days with whether each is paid, for a month review', async () => {
    const paid = await requests.request('mr', casual());
    expect(await lookups.leaveDays('mr', '2026-10-01', '2026-10-31')).toEqual([]); // only submitted
    await approvals.move('LEAVE', paid.id, 'MANAGER_APPROVED');
    const lop = await requests.request('mr', casual({ leaveTypeId: typeId('Loss of Pay'), startDate: '2026-10-30', endDate: '2026-11-03' }));
    await approvals.move('LEAVE', lop.id, 'APPROVED');
    const october = await lookups.leaveDays('mr', '2026-10-01', '2026-10-31');
    expect(october[0]).toMatchObject({ date: '2026-10-01', paid: true, portion: 1, status: 'MANAGER_APPROVED' });
    expect(october.filter((d) => !d.paid).map((d) => d.date)).toEqual(['2026-10-30', '2026-10-31']); // the days after the range are not in it
    expect(october.every((d, i) => i === 0 || october[i - 1]!.date <= d.date)).toBe(true);
  });

  it('lists the live leaves of a set of people for a team calendar, leaving out rejected and withdrawn ones', async () => {
    const waiting = await requests.request('mr', casual());
    const rejected = await requests.request('asm', casual());
    await approvals.move('LEAVE', rejected.id, 'REJECTED');

    const rows = await lookups.leavesForUsers(['mr', 'asm'], '2026-10-01', '2026-10-31');
    expect(rows.map((r) => [r.leaveId, r.userId, r.status])).toEqual([[waiting.id, 'mr', 'SUBMITTED']]);
    expect(rows[0]).toMatchObject({ startDate: '2026-10-01', leaveType: 'Casual' });

    await approvals.move('LEAVE', waiting.id, 'MANAGER_APPROVED');
    expect((await lookups.leavesForUsers(['mr'], '2026-10-01', '2026-10-31'))[0]?.status).toBe('MANAGER_APPROVED');
    expect(await lookups.leavesForUsers(['mr'], '2026-12-01', '2026-12-31')).toEqual([]); // outside the range
    expect(await lookups.leavesForUsers([], '2026-10-01', '2026-10-31')).toEqual([]);
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

  describe('approval cutoff: the first day of the leave (2026-10-12)', () => {
    const started = async () => {
      config.values['LEAVE_BACKDATE_DAYS'] = '30';
      return requests.request('mr', casual({ startDate: '2026-09-25', endDate: '2026-09-26' })); // two days before NOW (28 Sep)
    };

    it('a leave that has not started yet is approved as usual; one starting today too', async () => {
      const future = await requests.request('mr', casual());
      await approvals.move('LEAVE', future.id, 'MANAGER_APPROVED');
      await approvals.move('LEAVE', future.id, 'APPROVED');
      const today = await requests.request('mr', casual({ startDate: '2026-09-28', endDate: '2026-09-28' }));
      await approvals.move('LEAVE', today.id, 'APPROVED');
      expect(ledger().used).toBe(5);
    });

    it('once its first day has passed, neither the manager nor the final approver can approve it — rejecting still works', async () => {
      const leave = await started();
      const before = ledger();
      await expect(approvals.move('LEAVE', leave.id, 'MANAGER_APPROVED')).rejects.toMatchObject({ publicDetails: { code: 'LEAVE_APPROVAL_LATE' } });
      await expect(approvals.move('LEAVE', leave.id, 'APPROVED')).rejects.toMatchObject({ publicDetails: { code: 'LEAVE_APPROVAL_LATE' } });
      expect(ledger()).toEqual(before);
      await approvals.move('LEAVE', leave.id, 'REJECTED');
      expect(ledger().pending).toBe(0);
    });

    it('an Admin exception lets it through once, then it is spent', async () => {
      const leave = await started();
      await expect(cutoff.grant({ id: 'asm', role: 'FIELD' }, leave.id, { reason: 'was on duty' })).rejects.toMatchObject({ statusCode: 403 });
      await cutoff.grant({ id: 'admin', role: 'ADMIN' }, leave.id, { reason: 'was on duty' });
      await approvals.move('LEAVE', leave.id, 'APPROVED');
      expect(ledger().used).toBe(2);
      expect(grants.rows[0]?.status).toBe('USED');
      await approvals.move('LEAVE', leave.id, 'REOPENED');
      await expect(approvals.move('LEAVE', leave.id, 'APPROVED')).rejects.toMatchObject({ publicDetails: { code: 'LEAVE_APPROVAL_LATE' } });
    });

    it('the sweep rejects a pending leave that has started and frees its balance; future, decided and excepted ones stay', async () => {
      const sweep = new ExpireLateLeaves(leaves, grants, approvals, new HrCalendar(config, new Clock(NOW).now), new Clock(NOW).now);
      const lateOne = await started(); // 25-26 Sep: 2 days pending
      const future = await requests.request('mr', casual({ startDate: '2026-10-01', endDate: '2026-10-01' }));
      const excepted = await requests.request('mr', casual({ startDate: '2026-09-22', endDate: '2026-09-22' }));
      await cutoff.grant({ id: 'admin', role: 'ADMIN' }, excepted.id, { reason: 'x' });
      expect(ledger().pending).toBe(4);
      expect(await sweep.execute()).toBe(1);
      expect(approvals.requests.get(`LEAVE:${lateOne.id}`)?.status).toBe('REJECTED');
      expect(approvals.requests.get(`LEAVE:${future.id}`)?.status).toBe('SUBMITTED');
      expect(approvals.requests.get(`LEAVE:${excepted.id}`)?.status).toBe('SUBMITTED');
      expect(ledger().pending).toBe(2);
      expect(await sweep.execute()).toBe(0);
    });

    it('a revoked or expired exception no longer works', async () => {
      const leave = await started();
      await cutoff.grant({ id: 'admin', role: 'ADMIN' }, leave.id, { reason: 'x' });
      await cutoff.revoke({ id: 'admin', role: 'ADMIN' }, leave.id);
      await expect(approvals.move('LEAVE', leave.id, 'APPROVED')).rejects.toMatchObject({ publicDetails: { code: 'LEAVE_APPROVAL_LATE' } });
      await cutoff.grant({ id: 'admin', role: 'ADMIN' }, leave.id, { reason: 'x' });
      grants.rows.at(-1)!.expiresAt = new Date(NOW.getTime() - 1);
      await expect(approvals.move('LEAVE', leave.id, 'APPROVED')).rejects.toMatchObject({ publicDetails: { code: 'LEAVE_APPROVAL_LATE' } });
    });
  });

  describe('probation (2026-10-05)', () => {
    // 2026-10-01..2026-10-14: 11 working days against 6 Casual days.
    const long = () => casual({ startDate: '2026-10-01', endDate: '2026-10-14' });
    const joined = (on: string, probationMonths: number | null = null) => {
      const u = users.users.get('mr')!;
      u.dateOfJoining = new Date(`${on}T00:00:00+05:30`);
      u.onProbation = true;
      u.probationMonths = probationMonths;
    };

    it('during probation a paid leave is never refused for balance: it uses the balance there is, the rest is paid anyway', async () => {
      joined('2026-07-01'); // joined mid-year: 9 of 12 months of the 6 Casual days = 4.5
      const leave = await requests.request('mr', long());
      expect(leave.daysCount).toBe(11);
      expect(ledger()).toEqual({ used: 0, pending: 4.5 });
      await approvals.move('LEAVE', leave.id, 'APPROVED');
      expect(ledger()).toEqual({ used: 4.5, pending: 0 });
      await approvals.move('LEAVE', leave.id, 'REOPENED');
      expect(ledger()).toEqual({ used: 0, pending: 0 });
    });

    it('a rejection or withdrawal releases only what the ledger held', async () => {
      joined('2026-07-01');
      const leave = await requests.request('mr', long());
      await approvals.move('LEAVE', leave.id, 'WITHDRAWN');
      expect(ledger()).toEqual({ used: 0, pending: 0 });
    });

    it('with no balance left at all, the leave goes through and the ledger does not move', async () => {
      joined('2026-07-01', 12);
      await requests.request('mr', casual({ startDate: '2026-10-01', endDate: '2026-10-08' })); // 6 days: takes all 4.5
      expect(ledger()).toEqual({ used: 0, pending: 4.5 });
      const second = await requests.request('mr', casual({ startDate: '2026-10-12', endDate: '2026-10-16' }));
      expect(second.daysCount).toBe(5);
      expect(ledger()).toEqual({ used: 0, pending: 4.5 });
      await approvals.move('LEAVE', second.id, 'APPROVED');
      await approvals.move('LEAVE', second.id, 'REOPENED');
      expect(ledger()).toEqual({ used: 0, pending: 4.5 });
    });

    it('after probation, or with the toggle off, or with 0 months, the balance is checked as before', async () => {
      joined('2025-01-01');
      await expectError(requests.request('mr', long()), 409);
      joined('2026-07-01');
      config.values['PROBATION_LEAVE_PAID'] = 'false';
      await expectError(requests.request('mr', long()), 409);
      config.values['PROBATION_LEAVE_PAID'] = 'true';
      joined('2026-07-01', 0);
      await expectError(requests.request('mr', long()), 409);
    });

    it('an employee not marked on probation gets none, however recently they joined', async () => {
      joined('2026-07-01');
      users.users.get('mr')!.onProbation = false;
      await expectError(requests.request('mr', long()), 409);
      const lop = await requests.request('mr', casual({ leaveTypeId: typeId('Loss of Pay'), startDate: '2026-10-30', endDate: '2026-11-03' }));
      await approvals.move('LEAVE', lop.id, 'APPROVED');
      expect(await lookups.unpaidDays('mr', '2026-10')).toBe(2);
    });

    it('the employee’s own months beat the setting, and the setting applies when they have none', async () => {
      joined('2026-07-01', 1); // probation ended 2026-08-01
      await expectError(requests.request('mr', long()), 409);
      joined('2026-07-01', 12);
      await expect(requests.request('mr', long())).resolves.toBeDefined();
    });

    it('unpaid days inside probation are paid (not counted for Payroll); days after it, or with the toggle off, are', async () => {
      joined('2026-07-01'); // probation to 2027-01-01
      const lop = await requests.request('mr', casual({ leaveTypeId: typeId('Loss of Pay'), startDate: '2026-10-30', endDate: '2026-11-03' }));
      await approvals.move('LEAVE', lop.id, 'APPROVED');
      expect(await lookups.unpaidDays('mr', '2026-10')).toBe(0);
      config.values['PROBATION_LEAVE_PAID'] = 'false';
      expect(await lookups.unpaidDays('mr', '2026-10')).toBe(2);
      config.values['PROBATION_LEAVE_PAID'] = 'true';
      joined('2026-07-01', 4); // probation ends 2026-11-01: Fri 30 / Sat 31 Oct paid, Mon 2 / Tue 3 Nov not
      expect(await lookups.unpaidDays('mr', '2026-10')).toBe(0);
      expect(await lookups.unpaidDays('mr', '2026-11')).toBe(2);
    });
  });

  describe('locked once the salary for the month is finalized (2026-10-05)', () => {
    it('refuses a new request, and an edit, that touches a finalized month — other months and other people are free', async () => {
      const leave = await requests.request('mr', casual());
      await approvals.move('LEAVE', leave.id, 'REJECTED');
      finalizedMonths.add('mr:2026-10');
      await expectError(requests.request('mr', casual({ startDate: '2026-10-12', endDate: '2026-10-13' })), 409);
      await expectError(requests.edit('mr', leave.id, casual()), 409);
      await expect(requests.request('mr', casual({ startDate: '2026-11-02', endDate: '2026-11-03' }))).resolves.toBeDefined();
      expect(finalizedMonths.has('asm:2026-10')).toBe(false);
    });

    it('refuses approving, and reopening, a leave in a finalized month — but rejecting or withdrawing one that was never approved is fine', async () => {
      const a = await requests.request('mr', casual({ startDate: '2026-10-05', endDate: '2026-10-06' }));
      const b = await requests.request('mr', casual({ startDate: '2026-10-07', endDate: '2026-10-08' }));
      await approvals.move('LEAVE', a.id, 'APPROVED');
      finalizedMonths.add('mr:2026-10');
      await expectError(approvals.move('LEAVE', a.id, 'REOPENED'), 409);
      await expectError(approvals.move('LEAVE', b.id, 'APPROVED'), 409);
      await expect(approvals.move('LEAVE', b.id, 'REJECTED')).resolves.not.toThrow();
    });

    it('applies to unpaid leave too, the type that feeds salary', async () => {
      const lop = await requests.request('mr', casual({ leaveTypeId: typeId('Loss of Pay'), startDate: '2026-10-05', endDate: '2026-10-05' }));
      finalizedMonths.add('mr:2026-10');
      await expectError(approvals.move('LEAVE', lop.id, 'APPROVED'), 409);
    });

    it('is switched off by the setting', async () => {
      finalizedMonths.add('mr:2026-10');
      config.values['LEAVE_LOCKED_AFTER_PAYROLL'] = 'false';
      await expect(requests.request('mr', casual())).resolves.toBeDefined();
    });

    it('does nothing until Payroll is bound', async () => {
      const unbound = new LeaveLock(config);
      await expect(unbound.assertUnlocked('mr', ['2026-10-05'])).resolves.toBeUndefined();
    });
  });
});
