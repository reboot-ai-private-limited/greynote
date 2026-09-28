import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { PlanDay } from '../../domain/plan.js';
import { GetDailyPlanUseCase } from './getDailyPlan.usecase.js';
import { GetPlanStatusUseCase } from './getPlanStatus.usecase.js';
import { Clock, planningKit } from './planningTestKit.js';
import { SaveDailyPlanUseCase } from './saveDailyPlan.usecase.js';
import { SubmitDailyPlanUseCase } from './submitDailyPlan.usecase.js';

const MR = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const OTHER = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const DATE = '2026-10-05';
// 10:00 IST on DATE is 04:30Z.
const BEFORE_CUTOFF = '2026-10-05T04:00:00Z';
const AFTER_CUTOFF = '2026-10-05T04:31:00Z';

const fieldDay = (overrides: Partial<PlanDay> = {}): PlanDay => ({
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

describe('Daily Plan', () => {
  let clock: Clock;
  let kit: ReturnType<typeof planningKit>;
  let save: SaveDailyPlanUseCase;
  let submit: SubmitDailyPlanUseCase;
  let get: GetDailyPlanUseCase;
  let status: GetPlanStatusUseCase;

  beforeEach(() => {
    clock = new Clock(new Date(BEFORE_CUTOFF));
    kit = planningKit(clock);
    kit.users.add(ASM);
    kit.users.add(MR, { managerId: ASM });
    kit.users.add(OTHER);
    kit.routes.byUser.set(MR, [ROUTE]);
    save = new SaveDailyPlanUseCase(kit.dailyPlans, kit.approvals, kit.views);
    submit = new SubmitDailyPlanUseCase(kit.dailyPlans, kit.deadlines, kit.submitter);
    get = new GetDailyPlanUseCase(kit.dailyPlans, kit.users, kit.views);
    status = new GetPlanStatusUseCase(kit.dailyPlans, kit.monthlyPlans, kit.approvals);
  });

  it('saves a draft with its deadline in the business timezone', async () => {
    const plan = await save.execute(MR, DATE, fieldDay());
    expect(plan.status).toBe('DRAFT');
    expect(plan.submitDeadline.toISOString()).toBe('2026-10-05T04:30:00.000Z');
  });

  it('submits before the deadline', async () => {
    const plan = await save.execute(MR, DATE, fieldDay());
    const request = await submit.execute(MR, plan.id);
    expect(request.status).toBe('SUBMITTED');
    expect(await status.daily(MR, DATE)).toBe('SUBMITTED');
  });

  it('refuses a submit after the deadline', async () => {
    const plan = await save.execute(MR, DATE, fieldDay());
    clock.set(AFTER_CUTOFF);
    const err = await expectError(submit.execute(MR, plan.id), 409, 'PLAN_SUBMIT_LATE');
    expect(err.publicDetails).toEqual({ planKey: DATE, deadline: '2026-10-05T04:30:00.000Z' });
    expect(await status.daily(MR, DATE)).toBe('DRAFT');
  });

  it('reads the cutoff from Config on every submit', async () => {
    const plan = await save.execute(MR, DATE, fieldDay());
    clock.set(AFTER_CUTOFF);
    kit.config.values['DAILY_PLAN_SUBMIT_CUTOFF_TIME'] = '11:00';
    expect((await submit.execute(MR, plan.id)).status).toBe('SUBMITTED');
  });

  it('refuses a late resubmit once the after-rejection window has closed', async () => {
    const plan = await save.execute(MR, DATE, fieldDay());
    await submit.execute(MR, plan.id);
    // Rejected at 09:00 IST: the window is just the deadline, 10:00.
    kit.approvals.setStatus('DAILY_PLAN', plan.id, 'REJECTED', new Date('2026-10-05T03:30:00Z'));
    clock.set(AFTER_CUTOFF);
    await save.execute(MR, DATE, fieldDay({ remarks: 'fixed' }));
    await expectError(submit.execute(MR, plan.id), 409, 'PLAN_SUBMIT_LATE');
  });

  it('says a waiting plan is waiting, not late', async () => {
    const plan = await save.execute(MR, DATE, fieldDay());
    await submit.execute(MR, plan.id);
    clock.set(AFTER_CUTOFF);
    const err = await expectError(submit.execute(MR, plan.id), 409, 'CONFLICT');
    expect(err.message).toMatch(/already waiting/);
  });

  it('freezes a plan while it waits, and unfreezes it after a rejection', async () => {
    const plan = await save.execute(MR, DATE, fieldDay());
    await submit.execute(MR, plan.id);
    await expectError(save.execute(MR, DATE, fieldDay({ remarks: 'edit' })), 409);
    kit.approvals.setStatus('DAILY_PLAN', plan.id, 'REJECTED');
    expect((await save.execute(MR, DATE, fieldDay({ remarks: 'edit' }))).remarks).toBe('edit');
  });

  it('refuses a blocked user', async () => {
    const plan = await save.execute(MR, DATE, fieldDay());
    kit.users.users.get(MR)!.isBlocked = true;
    await expectError(submit.execute(MR, plan.id), 403);
  });

  it('checks the day’s shape on save, and routes and colleagues on submit', async () => {
    await expectError(save.execute(MR, DATE, fieldDay({ routeIds: [] })), 400);
    await expectError(save.execute(MR, DATE, { ...fieldDay(), workingType: 'MEETING' }), 400);
    await expectError(save.execute(MR, DATE, fieldDay({ workWith: [MR] })), 400);

    const plan = await save.execute(MR, DATE, fieldDay({ routeIds: ['bbbbbbbbbbbbbbbbbbbbbbb9'] }));
    const err = await expectError(submit.execute(MR, plan.id), 400);
    expect(err.publicDetails).toMatchObject({ field: 'routeIds', routeIds: ['bbbbbbbbbbbbbbbbbbbbbbb9'] });

    kit.users.add('ccccccccccccccccccccccc1', { status: 'inactive' });
    await save.execute(MR, DATE, fieldDay({ workWith: ['ccccccccccccccccccccccc1'] }));
    await expectError(submit.execute(MR, plan.id), 400);
  });

  it('refuses a submit if the plan was edited while it was being validated', async () => {
    const plan = await save.execute(MR, DATE, fieldDay());
    kit.routes.onList = async () => {
      kit.routes.onList = undefined;
      await save.execute(MR, DATE, fieldDay({ remarks: 'sneaky' }));
    };
    await expectError(submit.execute(MR, plan.id), 409, 'CONFLICT');
    expect(await status.daily(MR, DATE)).toBe('DRAFT');
  });

  it('only lets the owner submit', async () => {
    const plan = await save.execute(MR, DATE, fieldDay());
    await expectError(submit.execute(ASM, plan.id), 404);
  });

  it('lets the owner, their managers and Admin read a plan, nobody else', async () => {
    const plan = await save.execute(MR, DATE, fieldDay());
    await expect(get.execute({ id: MR, role: 'FIELD' }, plan.id)).resolves.toMatchObject({ id: plan.id });
    await expect(get.execute({ id: ASM, role: 'FIELD' }, plan.id)).resolves.toMatchObject({ id: plan.id });
    await expect(get.execute({ id: OTHER, role: 'ADMIN' }, plan.id)).resolves.toMatchObject({ id: plan.id });
    await expectError(get.execute({ id: OTHER, role: 'FIELD' }, plan.id), 403);
  });

  it('opens the DCR gate only once the plan is past the manager', async () => {
    expect(await status.isDailyPlanApproved(MR, DATE)).toBe(false); // no plan
    const plan = await save.execute(MR, DATE, fieldDay());
    expect(await status.isDailyPlanApproved(MR, DATE)).toBe(false); // draft
    await submit.execute(MR, plan.id);
    expect(await status.isDailyPlanApproved(MR, DATE)).toBe(false);
    for (const [s, open] of [
      ['MANAGER_APPROVED', true],
      ['APPROVED', true],
      ['REJECTED', false],
      ['WITHDRAWN', false],
      ['REOPENED', false],
    ] as const) {
      kit.approvals.setStatus('DAILY_PLAN', plan.id, s);
      expect(await status.isDailyPlanApproved(MR, DATE)).toBe(open);
    }
  });

  it('fails loudly on a malformed cutoff in Config', async () => {
    const plan = await save.execute(MR, DATE, fieldDay());
    kit.config.values['DAILY_PLAN_SUBMIT_CUTOFF_TIME'] = '10am';
    const err = await expectError(submit.execute(MR, plan.id), 500);
    expect(err.details).toMatchObject({ reason: 'CONFIG_VALUE_INVALID', key: 'DAILY_PLAN_SUBMIT_CUTOFF_TIME' });
  });
});
