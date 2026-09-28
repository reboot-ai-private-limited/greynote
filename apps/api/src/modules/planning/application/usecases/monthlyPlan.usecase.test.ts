import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import { GetPlanStatusUseCase } from './getPlanStatus.usecase.js';
import { Clock, planningKit } from './planningTestKit.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';
import { SubmitMonthlyPlanUseCase } from './submitMonthlyPlan.usecase.js';

const MR = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const MONTH = '2026-10';
// The end of 28 Sep in IST is 18:29:59.999Z.
const BEFORE_CUTOFF = '2026-09-28T18:00:00Z';
const AFTER_CUTOFF = '2026-09-28T18:30:00Z';

const entry = (planDate: string, overrides: Partial<MonthlyPlanEntry> = {}): MonthlyPlanEntry => ({
  planDate,
  workingType: 'FIELD_WORK',
  workWith: [],
  routeIds: [ROUTE],
  remarks: null,
  ...overrides,
});

async function expectError(promise: Promise<unknown>, statusCode: number, code?: string) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
  if (code) expect((err as AppError).code).toBe(code);
  return err as AppError;
}

describe('Monthly Plan', () => {
  let clock: Clock;
  let kit: ReturnType<typeof planningKit>;
  let save: SaveMonthlyPlanUseCase;
  let submit: SubmitMonthlyPlanUseCase;
  let status: GetPlanStatusUseCase;

  beforeEach(() => {
    clock = new Clock(new Date(BEFORE_CUTOFF));
    kit = planningKit(clock);
    kit.users.add(MR);
    kit.routes.byUser.set(MR, [ROUTE]);
    save = new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views);
    submit = new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter);
    status = new GetPlanStatusUseCase(kit.dailyPlans, kit.monthlyPlans, kit.approvals);
  });

  it('saves the month sorted by date, due at the end of the 28th before it', async () => {
    const plan = await save.execute(MR, MONTH, [entry('2026-10-06'), entry('2026-10-05')]);
    expect(plan.entries.map((e) => e.planDate)).toEqual(['2026-10-05', '2026-10-06']);
    expect(plan.status).toBe('DRAFT');
    expect(plan.submitDeadline.toISOString()).toBe('2026-09-28T18:29:59.999Z');
  });

  it('submits the whole month as one request', async () => {
    const plan = await save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-06')]);
    expect((await submit.execute(MR, plan.id)).status).toBe('SUBMITTED');
    expect(await status.monthly(MR, MONTH)).toBe('SUBMITTED');
  });

  it('refuses a submit after the deadline', async () => {
    const plan = await save.execute(MR, MONTH, [entry('2026-10-05')]);
    clock.set(AFTER_CUTOFF);
    const err = await expectError(submit.execute(MR, plan.id), 409, 'PLAN_SUBMIT_LATE');
    expect(err.publicDetails).toEqual({ planKey: MONTH, deadline: '2026-09-28T18:29:59.999Z' });
  });

  it('refuses days outside the month, a day twice, and an empty month at submit', async () => {
    await expectError(save.execute(MR, MONTH, [entry('2026-11-01')]), 400);
    await expectError(save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-05')]), 400);
    const empty = await save.execute(MR, MONTH, []);
    await expectError(submit.execute(MR, empty.id), 400);
  });

  it('names the entry a bad route is on', async () => {
    const plan = await save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-06', { routeIds: ['bbbbbbbbbbbbbbbbbbbbbbb9'] })]);
    const err = await expectError(submit.execute(MR, plan.id), 400);
    expect(err.publicDetails).toMatchObject({ field: 'entries.1.routeIds' });
  });

  it('freezes the month while it waits', async () => {
    const plan = await save.execute(MR, MONTH, [entry('2026-10-05')]);
    await submit.execute(MR, plan.id);
    await expectError(save.execute(MR, MONTH, [entry('2026-10-06')]), 409);
  });
});
