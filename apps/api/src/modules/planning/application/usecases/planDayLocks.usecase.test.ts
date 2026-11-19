import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import { AmendMonthlyPlanUseCase } from './amendMonthlyPlan.usecase.js';
import { PlanDayLocks } from '../dayLocks.js';
import { Clock, inlineTransactions, planningKit } from './planningTestKit.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';
import { SubmitMonthlyPlanUseCase } from './submitMonthlyPlan.usecase.js';

const ADMIN = 'aaaaaaaaaaaaaaaaaaaaaaa0';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const MR = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbb3';
const OUT = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const MONTH = '2026-10';

const entry = (planDate: string, overrides: Partial<MonthlyPlanEntry> = {}): MonthlyPlanEntry => ({
  planDate,
  returnDate: null,
  workingType: 'FIELD_WORK',
  dayKind: 'NORMAL',
  workWith: [],
  routeIds: [ROUTE],
  remarks: null,
  ...overrides,
});
const trip = (planDate: string, returnDate: string) => entry(planDate, { routeIds: [OUT], returnDate });

async function expectLocked(promise: Promise<unknown>) {
  const err = await promise.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(409);
  expect((err as AppError).publicDetails).toMatchObject({ reason: 'PLAN_DAY_LOCKED' });
  return err as AppError;
}

describe('a Tour Plan that was approved keeps the days already worked or sent (decision-log 2026-11-18)', () => {
  let kit: ReturnType<typeof planningKit>;
  let clock: Clock;
  let save: SaveMonthlyPlanUseCase;
  let amend: AmendMonthlyPlanUseCase;
  let planId: string;

  /** Sent and approved in September; the tests then run on 10 October. */
  async function approveWith(entries: MonthlyPlanEntry[]) {
    clock.set('2026-09-20T04:00:00Z');
    planId = (await save.execute(MR, MONTH, entries)).id;
    await new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter).execute(MR, planId);
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'APPROVED');
    clock.set('2026-10-10T04:00:00Z');
  }

  beforeEach(() => {
    clock = new Clock(new Date('2026-10-10T04:00:00Z'));
    kit = planningKit(clock);
    kit.users.add(ADMIN, { role: 'ADMIN' });
    kit.users.add(ASM, { level: 2 });
    kit.users.add(MR, { managerId: ASM });
    kit.routes.byUser.set(MR, [ROUTE, OTHER, OUT]);
    kit.routes.types.set(OUT, 'OUT_STATION');
    const locks = new PlanDayLocks(kit.dailyPlans, kit.approvals, kit.deadlines);
    save = new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views, kit.offDays, locks);
    amend = new AmendMonthlyPlanUseCase(kit.monthlyPlans, kit.users, kit.approvals, kit.submitter, kit.views, kit.offDays, clock.now, { deadlines: kit.deadlines, daily: kit.dailyPlans, transactions: inlineTransactions }, locks);
  });

  it('records the approved days, so a later edit has something to be compared with', async () => {
    await approveWith([entry('2026-10-05'), entry('2026-10-15')]);
    expect((await kit.monthlyPlans.findById(planId))?.approvedEntries?.map((e) => e.planDate)).toEqual(['2026-10-05', '2026-10-15']);
  });

  it('the employee cannot change a past day after a reopen, and the message names it', async () => {
    await approveWith([entry('2026-10-05'), entry('2026-10-15')]);
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
    const err = await expectLocked(save.execute(MR, MONTH, [entry('2026-10-05', { routeIds: [OTHER] }), entry('2026-10-15')]));
    expect(err.message).toMatch(/Mon, 5 Oct.*past/);
  });

  it('nor add a day to the past, nor drop one', async () => {
    await approveWith([entry('2026-10-05'), entry('2026-10-15')]);
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
    await expectLocked(save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-08'), entry('2026-10-15')]));
    await expectLocked(save.execute(MR, MONTH, [entry('2026-10-15')]));
  });

  it('can still change a later day', async () => {
    await approveWith([entry('2026-10-05'), entry('2026-10-15')]);
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
    const saved = await save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-15', { routeIds: [OTHER] })]);
    expect(saved.entries[1]?.routeIds).toEqual([OTHER]);
  });

  it('a later day whose daily plan has gone to approval is locked too', async () => {
    await approveWith([entry('2026-10-15'), entry('2026-10-16')]);
    const day = await kit.dailyPlans.findByUserAndDate(MR, '2026-10-16');
    await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: day!.id, submitterId: MR });
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
    const err = await expectLocked(save.execute(MR, MONTH, [entry('2026-10-15'), entry('2026-10-16', { routeIds: [OTHER] })]));
    expect(err.message).toMatch(/Fri, 16 Oct.*sent for approval/);
  });

  it('a manager editing the waiting plan cannot change a past day either', async () => {
    await approveWith([entry('2026-10-05'), entry('2026-10-15')]);
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
    await kit.approvals.submit({ kind: 'MONTHLY_PLAN', recordId: planId, submitterId: MR });
    await expectLocked(amend.execute({ id: ASM, role: 'FIELD' }, planId, [entry('2026-10-05', { remarks: 'x' }), entry('2026-10-15')], ''));
    const ok = await amend.execute({ id: ASM, role: 'FIELD' }, planId, [entry('2026-10-05'), entry('2026-10-15', { remarks: 'x' })], '');
    expect(ok.entries[1]?.remarks).toBe('x');
  });

  describe('trips', () => {
    it('a trip that has begun can only have its return moved later', async () => {
      await approveWith([trip('2026-10-09', '2026-10-13')]);
      await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
      await expectLocked(save.execute(MR, MONTH, [trip('2026-10-09', '2026-10-10')])); // would end today
      await expectLocked(save.execute(MR, MONTH, [entry('2026-10-09')])); // cancelled
      const longer = await save.execute(MR, MONTH, [trip('2026-10-09', '2026-10-15')]);
      expect(longer.entries.at(-1)).toMatchObject({ planDate: '2026-10-15', dayKind: 'TRANSIT' });
    });

    it('a trip cannot be started from a day that is over', async () => {
      await approveWith([entry('2026-10-05'), entry('2026-10-15')]);
      await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
      await expectLocked(save.execute(MR, MONTH, [trip('2026-10-05', '2026-10-07'), entry('2026-10-15')]));
    });
  });

  describe('time passes between sending and approving', () => {
    it('days that became past are put back to what was approved, and it is recorded', async () => {
      await approveWith([entry('2026-10-12'), entry('2026-10-13'), entry('2026-10-20')]);
      await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
      // The employee changes the 12th and the 20th while both are still ahead, and sends it on the 10th.
      await save.execute(MR, MONTH, [entry('2026-10-12', { routeIds: [OTHER] }), entry('2026-10-13'), entry('2026-10-20', { routeIds: [OTHER] })]);
      await kit.approvals.submit({ kind: 'MONTHLY_PLAN', recordId: planId, submitterId: MR });
      // Approved three days later, on the 14th: the 12th and the 13th are over.
      clock.set('2026-10-14T04:00:00Z');
      await kit.approvals.decide('MONTHLY_PLAN', planId, 'APPROVED');
      const plan = (await kit.monthlyPlans.findById(planId))!;
      expect(plan.entries.find((e) => e.planDate === '2026-10-12')?.routeIds).toEqual([ROUTE]);
      expect(plan.entries.find((e) => e.planDate === '2026-10-20')?.routeIds).toEqual([OTHER]);
      expect(plan.amendments.at(-1)?.reason).toMatch(/Kept as already worked: .*12 Oct/);
      expect(plan.approvedEntries?.find((e) => e.planDate === '2026-10-12')?.routeIds).toEqual([ROUTE]);
    });

    it('a day typed into the past after the approval is dropped, and a deleted worked day comes back', async () => {
      await approveWith([entry('2026-10-12'), entry('2026-10-20')]);
      await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
      await save.execute(MR, MONTH, [entry('2026-10-13'), entry('2026-10-20')]); // 12th dropped, 13th added: both ahead at the time
      await kit.approvals.submit({ kind: 'MONTHLY_PLAN', recordId: planId, submitterId: MR });
      clock.set('2026-10-14T04:00:00Z');
      await kit.approvals.decide('MONTHLY_PLAN', planId, 'APPROVED');
      expect((await kit.monthlyPlans.findById(planId))?.entries.map((e) => e.planDate)).toEqual(['2026-10-12', '2026-10-20']);
    });
  });

  it('a plan that was never approved is not locked by the calendar', async () => {
    clock.set('2026-09-20T04:00:00Z');
    await save.execute(MR, MONTH, [entry('2026-10-05')]);
    clock.set('2026-10-10T04:00:00Z');
    const saved = await save.execute(MR, MONTH, [entry('2026-10-05', { routeIds: [OTHER] })]);
    expect(saved.entries[0]?.routeIds).toEqual([OTHER]);
  });

  describe('the Tour Plan mirrors an approved Daily Plan', () => {
    it('an approved change of working type and routes is written into that day, with a note', async () => {
      await approveWith([entry('2026-10-15'), entry('2026-10-16')]);
      const day = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))!;
      kit.dailyPlans.rows.set(day.id, { ...day, workingType: 'MEETING', routeIds: [], doctors: [] });
      await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: day.id, submitterId: MR });
      await kit.approvals.decide('DAILY_PLAN', day.id, 'APPROVED');
      const plan = (await kit.monthlyPlans.findById(planId))!;
      expect(plan.entries.find((e) => e.planDate === '2026-10-15')).toMatchObject({ workingType: 'MEETING', routeIds: [] });
      expect(plan.entries.find((e) => e.planDate === '2026-10-16')?.workingType).toBe('FIELD_WORK');
      expect(plan.amendments.at(-1)?.reason).toMatch(/Changed on the Daily Plan for .*15 Oct/);
    });

    it('a day that already matches changes nothing', async () => {
      await approveWith([entry('2026-10-15')]);
      const day = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))!;
      await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: day.id, submitterId: MR });
      await kit.approvals.decide('DAILY_PLAN', day.id, 'APPROVED');
      expect((await kit.monthlyPlans.findById(planId))?.amendments).toHaveLength(0);
    });

    it('the days of a trip are left alone', async () => {
      await approveWith([trip('2026-10-15', '2026-10-17')]);
      const stay = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-16'))!;
      kit.dailyPlans.rows.set(stay.id, { ...stay, remarks: 'moved' });
      await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: stay.id, submitterId: MR });
      await kit.approvals.decide('DAILY_PLAN', stay.id, 'APPROVED');
      expect((await kit.monthlyPlans.findById(planId))?.entries.find((e) => e.planDate === '2026-10-16')?.remarks).toBeNull();
    });

    it('after the day was worked, a re-approved month keeps what the daily plan says', async () => {
      await approveWith([entry('2026-10-12'), entry('2026-10-20')]);
      const day = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-12'))!;
      kit.dailyPlans.rows.set(day.id, { ...day, remarks: 'moved' });
      await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: day.id, submitterId: MR });
      await kit.approvals.decide('DAILY_PLAN', day.id, 'APPROVED');
      await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
      await save.execute(MR, MONTH, [entry('2026-10-12', { remarks: 'moved' }), entry('2026-10-20')]);
      await kit.approvals.submit({ kind: 'MONTHLY_PLAN', recordId: planId, submitterId: MR });
      clock.set('2026-10-14T04:00:00Z');
      await kit.approvals.decide('MONTHLY_PLAN', planId, 'APPROVED');
      expect((await kit.monthlyPlans.findById(planId))?.entries.find((e) => e.planDate === '2026-10-12')?.remarks).toBe('moved');
    });
  });
});
