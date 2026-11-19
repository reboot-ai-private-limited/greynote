import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import { PlanDayLocks } from '../dayLocks.js';
import { GetPlanStatusUseCase } from './getPlanStatus.usecase.js';
import { Clock, planningKit } from './planningTestKit.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';
import { SubmitMonthlyPlanUseCase } from './submitMonthlyPlan.usecase.js';

const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const MR = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const OTHER = 'bbbbbbbbbbbbbbbbbbbbbbb3';
const MONTH = '2026-10';

const entry = (planDate: string, overrides: Partial<MonthlyPlanEntry> = {}): MonthlyPlanEntry => ({ planDate, returnDate: null, workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: [ROUTE], remarks: null, ...overrides });
const code = async (p: Promise<unknown>) => ((await p.then(() => undefined, (e: unknown) => e)) as AppError | undefined)?.code;

describe('a reopened Tour Plan (decision-log 2026-11-19)', () => {
  let kit: ReturnType<typeof planningKit>;
  let clock: Clock;
  let save: SaveMonthlyPlanUseCase;
  let submit: SubmitMonthlyPlanUseCase;
  let status: GetPlanStatusUseCase;
  let planId: string;

  beforeEach(async () => {
    clock = new Clock(new Date('2026-09-20T04:00:00Z'));
    kit = planningKit(clock);
    kit.users.add(ASM, { level: 2 });
    kit.users.add(MR, { managerId: ASM });
    kit.routes.byUser.set(MR, [ROUTE, OTHER]);
    save = new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views, kit.offDays, new PlanDayLocks(kit.dailyPlans, kit.approvals, kit.deadlines));
    submit = new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter);
    status = new GetPlanStatusUseCase(kit.dailyPlans, kit.monthlyPlans, kit.approvals);
    planId = (await save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-15'), entry('2026-10-16')])).id;
    await submit.execute(MR, planId);
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'APPROVED');
    clock.set('2026-10-10T04:00:00Z'); // the running month, long after the submit deadline
  });

  it('can be sent again in the running month once reopened, with a day after today changed', async () => {
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
    await save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-15', { routeIds: [OTHER] }), entry('2026-10-16')]);
    expect((await submit.execute(MR, planId)).status).toBe('SUBMITTED');
  });

  it('a past day cannot change in the edit, and a day whose daily plan is sent stays as it is', async () => {
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
    expect(await code(save.execute(MR, MONTH, [entry('2026-10-05', { routeIds: [OTHER] }), entry('2026-10-15'), entry('2026-10-16')]))).toBe('CONFLICT');
    const day = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))!;
    await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: day.id, submitterId: MR });
    expect(await code(save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-15', { routeIds: [OTHER] }), entry('2026-10-16')]))).toBe('CONFLICT');
  });

  it('a plan that was never reopened still cannot be sent late', async () => {
    const other = (await save.execute(MR, '2026-11', [entry('2026-11-10')])).id; // November's deadline (28 Oct) has not passed on 10 Oct, so move on
    clock.set('2026-11-05T04:00:00Z');
    expect(await code(submit.execute(MR, other))).toBe('PLAN_SUBMIT_LATE');
    expect(other).toBeTruthy();
  });

  it('the month stays open for daily work while it is reopened or waiting again; a never-approved month stays closed', async () => {
    expect(await status.isMonthlyPlanApproved(MR, MONTH)).toBe(true);
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
    expect(await status.isMonthlyPlanApproved(MR, MONTH)).toBe(true);
    await save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-15'), entry('2026-10-16', { routeIds: [OTHER] })]);
    await submit.execute(MR, planId);
    expect(await status.isMonthlyPlanApproved(MR, MONTH)).toBe(true);
    clock.set('2026-10-20T04:00:00Z');
    const never = (await save.execute(MR, '2026-11', [entry('2026-11-10')])).id;
    expect(never).toBeTruthy();
    expect(await status.isMonthlyPlanApproved(MR, '2026-11')).toBe(false);
  });

  it('re-approval changes the untouched future day and keeps the days already worked', async () => {
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'REOPENED');
    await save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-15', { routeIds: [OTHER] }), entry('2026-10-16')]);
    await submit.execute(MR, planId);
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'APPROVED');
    expect((await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))?.routeIds).toEqual([OTHER]);
    expect((await kit.monthlyPlans.findById(planId))?.entries.find((e) => e.planDate === '2026-10-05')?.routeIds).toEqual([ROUTE]);
  });
});
