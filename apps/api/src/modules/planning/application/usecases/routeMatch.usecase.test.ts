import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import { Clock, planningKit } from './planningTestKit.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';
import { SubmitDailyPlanUseCase } from './submitDailyPlan.usecase.js';
import { SubmitMonthlyPlanUseCase } from './submitMonthlyPlan.usecase.js';

const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const MR = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const OTHER_ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb3';
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

async function refusal(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}
const reasonOf = (err: AppError) => (err.publicDetails as { reason?: string } | undefined)?.reason;

describe('A Daily Plan’s routes are its Tour Plan’s (decision-log 2026-11-19)', () => {
  let kit: ReturnType<typeof planningKit>;
  let submit: SubmitDailyPlanUseCase;

  let clock: Clock;
  beforeEach(async () => {
    clock = new Clock(new Date('2026-09-20T04:00:00Z'));
    kit = planningKit(clock);
    kit.users.add(ASM, { level: 2 });
    kit.users.add(MR, { managerId: ASM });
    kit.routes.byUser.set(MR, [ROUTE, OTHER_ROUTE]);
    const saved = await new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views).execute(MR, MONTH, [entry('2026-10-15'), entry('2026-10-16', { workingType: 'MEETING', routeIds: [] })]);
    await new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter).execute(MR, saved.id);
    await kit.approvals.decide('MONTHLY_PLAN', saved.id, 'APPROVED');
    clock.set('2026-10-15T04:00:00Z');
    submit = new SubmitDailyPlanUseCase(kit.dailyPlans, kit.deadlines, kit.submitter, kit.approvals, kit.carryOver, kit.monthlyApproved, kit.scope, kit.monthlyPlans);
  });

  it('refuses to submit a day whose routes differ from the Tour Plan, and says to change the Tour Plan', async () => {
    const day = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))!;
    kit.dailyPlans.rows.set(day.id, { ...day, routeIds: [OTHER_ROUTE] });
    const err = await refusal(submit.execute(MR, day.id));
    expect(reasonOf(err)).toBe('PLAN_ROUTE_MISMATCH');
    expect(err.message).toContain('change the Tour Plan');
  });

  it('refuses to approve it too', async () => {
    const day = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))!;
    await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: day.id, submitterId: MR });
    kit.dailyPlans.rows.set(day.id, { ...day, routeIds: [OTHER_ROUTE] });
    expect(reasonOf(await refusal(kit.approvals.decide('DAILY_PLAN', day.id, 'APPROVED')))).toBe('PLAN_ROUTE_MISMATCH');
  });

  it('a day with the Tour Plan’s routes submits, and a meeting day (no routes) is not checked', async () => {
    clock.set('2026-10-15T04:00:00Z'); // a Daily Plan is sent on its own day (2026-11-28)
    const field = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))!;
    expect((await submit.execute(MR, field.id)).status).toBe('SUBMITTED');
    clock.set('2026-10-16T04:00:00Z');
    const meeting = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-16'))!;
    kit.dailyPlans.rows.set(meeting.id, { ...meeting, workingType: 'MEETING', routeIds: [] });
    expect((await submit.execute(MR, meeting.id)).status).toBe('SUBMITTED');
  });
});
