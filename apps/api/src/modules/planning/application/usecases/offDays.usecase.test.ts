import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import type { PlanOffDay } from '../../domain/offDays.js';
import { BackfillInheritedDaysUseCase } from './backfillInheritedDays.usecase.js';
import { Clock, inlineTransactions, planningKit } from './planningTestKit.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';
import { SubmitMonthlyPlanUseCase } from './submitMonthlyPlan.usecase.js';

const MR = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
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

async function refusal(promise: Promise<unknown>): Promise<{ message: string; field: unknown }> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(400);
  return { message: (err as AppError).message, field: ((err as AppError).publicDetails as { field?: unknown }).field };
}

/** Locked days as HR would give them: Sundays, Gandhi Jayanti, Durga Puja 18-19 Oct and a holiday on 2 Nov. */
const OFF: PlanOffDay[] = [
  { date: '2026-10-02', reason: 'HOLIDAY', name: 'Gandhi Jayanti' },
  { date: '2026-10-04', reason: 'WEEKLY_OFF', name: null },
  { date: '2026-10-11', reason: 'WEEKLY_OFF', name: null },
  { date: '2026-10-18', reason: 'HOLIDAY', name: 'Durga Puja' },
  { date: '2026-10-19', reason: 'HOLIDAY', name: 'Durga Puja' },
  { date: '2026-10-25', reason: 'WEEKLY_OFF', name: null },
  { date: '2026-11-01', reason: 'WEEKLY_OFF', name: null },
];

describe('Monthly Plan: weekly off and holidays are locked', () => {
  let clock: Clock;
  let kit: ReturnType<typeof planningKit>;
  let off: PlanOffDay[];
  let save: SaveMonthlyPlanUseCase;
  let submit: SubmitMonthlyPlanUseCase;

  beforeEach(() => {
    clock = new Clock(new Date('2026-09-20T05:00:00Z'));
    kit = planningKit(clock);
    kit.users.add(ASM);
    kit.users.add(MR, { managerId: ASM });
    kit.routes.byUser.set(MR, [ROUTE]);
    off = [...OFF];
    kit.offDays.bind(async (userId, from, to) => (userId === MR ? off.filter((d) => d.date >= from && d.date <= to) : []));
    save = new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views, kit.offDays);
    submit = new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter, kit.offDays);
  });

  it('shows the month’s locked days with the plan', async () => {
    const plan = await save.execute(MR, MONTH, [entry('2026-10-05')]);
    expect(plan.offDays.map((d) => d.date)).toEqual(['2026-10-02', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-19', '2026-10-25']);
  });

  it('refuses a day planned on a holiday or the weekly off, naming the row', async () => {
    expect(await refusal(save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-02')]))).toEqual({
      message: 'Fri, 2 Oct is a holiday (Gandhi Jayanti), so it can’t be planned.',
      field: 'entries.1.planDate',
    });
    expect(await refusal(save.execute(MR, MONTH, [entry('2026-10-04', { workingType: 'MEETING', routeIds: [] })]))).toEqual({
      message: 'Sun, 4 Oct is the weekly off, so it can’t be planned.',
      field: 'entries.0.planDate',
    });
    expect(await kit.monthlyPlans.findByUserAndMonth(MR, MONTH)).toBeNull();
  });

  describe('a trip may run over weekly offs and holidays (decision-log 2026-11-19)', () => {
    const OUT = 'bbbbbbbbbbbbbbbbbbbbbbb2';
    const days = (plan: { entries: MonthlyPlanEntry[] }) => plan.entries.map((e) => `${e.planDate}:${e.dayKind}`);
    beforeEach(() => {
      kit.routes.byUser.set(MR, [ROUTE, OUT]);
      kit.routes.types.set(OUT, 'OUT_STATION');
    });
    const trip = (planDate: string, returnDate: string) => entry(planDate, { routeIds: [OUT], returnDate });

    it('writes no stay day on an off day in the middle, and the days around it are still stay days', async () => {
      const plan = await save.execute(MR, MONTH, [trip('2026-10-16', '2026-10-21')]);
      expect(days(plan)).toEqual(['2026-10-16:NORMAL', '2026-10-17:STAY', '2026-10-20:STAY', '2026-10-21:TRANSIT']); // 18 and 19 are the Durga Puja holiday
      expect(plan.entries[0]?.returnDate).toBe('2026-10-21');
    });

    it('may come back on an off day: the trip ends there with no return day written', async () => {
      const plan = await save.execute(MR, MONTH, [trip('2026-10-16', '2026-10-18')]);
      expect(days(plan)).toEqual(['2026-10-16:NORMAL', '2026-10-17:STAY']);
      expect(plan.entries[0]?.returnDate).toBe('2026-10-18');
    });

    it('still refuses a trip that sets out on an off day', async () => {
      expect((await refusal(save.execute(MR, MONTH, [trip('2026-10-18', '2026-10-21')]))).field).toBe('entries.0.planDate');
    });

    it('over a month end: 27th to next month, skipping next month’s off day, and re-saving what was read changes nothing', async () => {
      const plan = await save.execute(MR, MONTH, [trip('2026-10-27', '2026-11-03')]);
      expect(days(plan)).toEqual(['2026-10-27:NORMAL', '2026-10-28:STAY', '2026-10-29:STAY', '2026-10-30:STAY', '2026-10-31:STAY']);
      const next = (await kit.monthlyPlans.findByUserAndMonth(MR, '2026-11'))!;
      expect(days(next)).toEqual(['2026-11-02:STAY', '2026-11-03:TRANSIT']); // 1 Nov is a Sunday
      const again = await save.execute(MR, MONTH, plan.entries);
      expect(days(again)).toEqual(days(plan));
      expect(days((await kit.monthlyPlans.findByUserAndMonth(MR, '2026-11'))!)).toEqual(days(next));
    });

    it('a trip from last month that ends here is rebuilt without this month’s off days', async () => {
      await save.execute(MR, MONTH, [trip('2026-10-30', '2026-11-03')]);
      const next = await kit.monthlyPlans.findByUserAndMonth(MR, '2026-11');
      const saved = await save.execute(MR, '2026-11', [entry('2026-11-05'), ...next!.entries.filter((e) => e.dayKind === 'NORMAL')]);
      expect(days(saved)).toEqual(['2026-11-02:STAY', '2026-11-03:TRANSIT', '2026-11-05:NORMAL']);
    });
  });

  it('checks again at submit: a holiday added after the save stops the plan until that day is taken out', async () => {
    const plan = await save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-06')]);
    off.push({ date: '2026-10-06', reason: 'HOLIDAY', name: 'Local fair' });
    expect((await refusal(submit.execute(MR, plan.id))).field).toBe('entries.1.planDate');
    const fixed = await save.execute(MR, MONTH, [entry('2026-10-05')]);
    expect((await submit.execute(MR, fixed.id)).status).toBe('SUBMITTED');
  });

  it('writes no Daily Plan for a day that became an off day after approval, and leaves one already written alone', async () => {
    const plan = await save.execute(MR, MONTH, [entry('2026-10-06'), entry('2026-10-07'), entry('2026-10-08')]);
    await submit.execute(MR, plan.id);
    clock.set('2026-10-03T05:00:00Z');
    await kit.approvals.decide('MONTHLY_PLAN', plan.id, 'MANAGER_APPROVED');
    expect(await kit.dailyPlans.findByUserAndDate(MR, '2026-10-07')).not.toBeNull();

    // HR adds holidays on the 7th (already written) and the 8th, whose draft is gone (say it was never written); the final stage re-runs.
    kit.dailyPlans.rows.delete((await kit.dailyPlans.findByUserAndDate(MR, '2026-10-08'))!.id);
    off.push({ date: '2026-10-07', reason: 'HOLIDAY', name: 'Fair' }, { date: '2026-10-08', reason: 'HOLIDAY', name: 'Fair' });
    await kit.approvals.decide('MONTHLY_PLAN', plan.id, 'APPROVED');
    expect(await kit.dailyPlans.findByUserAndDate(MR, '2026-10-07')).not.toBeNull();
    expect(await kit.dailyPlans.findByUserAndDate(MR, '2026-10-08')).toBeNull();
  });

  it('the inheritance backfill skips off days too', async () => {
    const plan = await save.execute(MR, MONTH, [entry('2026-10-06'), entry('2026-10-07')]);
    await submit.execute(MR, plan.id);
    kit.approvals.setStatus('MONTHLY_PLAN', plan.id, 'APPROVED'); // approved without the hook, as before inheritance existed
    clock.set('2026-10-03T05:00:00Z');
    off.push({ date: '2026-10-07', reason: 'HOLIDAY', name: 'Fair' });
    const backfill = new BackfillInheritedDaysUseCase(kit.monthlyPlans, kit.dailyPlans, kit.approvals, kit.deadlines, inlineTransactions, kit.offDays);
    expect(await backfill.execute(true)).toEqual({ approvedMonthlyPlans: 1, dailyPlansWritten: 1 });
    expect(await kit.dailyPlans.findByUserAndDate(MR, '2026-10-07')).toBeNull();
  });
});
