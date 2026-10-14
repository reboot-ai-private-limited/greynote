import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { PlanDay } from '../../domain/plan.js';
import { Clock, planningKit, SeedDailyPlan } from './planningTestKit.js';
import { SubmitDailyPlanUseCase } from './submitDailyPlan.usecase.js';

const RSM = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const MR1 = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const MR2 = 'aaaaaaaaaaaaaaaaaaaaaaa4';
const STRANGER = 'aaaaaaaaaaaaaaaaaaaaaaa5';
const R_RSM = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const R_MR1 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const R_MR2 = 'bbbbbbbbbbbbbbbbbbbbbbb3';
const D_RSM = 'cccccccccccccccccccccc01';
const D_MR1 = 'cccccccccccccccccccccc02';
const D_MR2 = 'cccccccccccccccccccccc03';
const DATE = '2026-10-05';

const fieldDay = (overrides: Partial<PlanDay> = {}): PlanDay => ({ workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: [R_RSM], remarks: null, ...overrides });

async function expectError(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
  return err as AppError;
}

describe('A manager’s Daily Plan', () => {
  let kit: ReturnType<typeof planningKit>;
  let seed: SeedDailyPlan;
  let submit: SubmitDailyPlanUseCase;

  beforeEach(() => {
    kit = planningKit(new Clock(new Date('2026-10-05T04:00:00Z')));
    kit.users.add(RSM, { level: 3 });
    kit.users.add(ASM, { level: 2, managerId: RSM });
    kit.users.add(MR1, { level: 1, managerId: ASM });
    kit.users.add(MR2, { level: 1, managerId: ASM });
    kit.users.add(STRANGER, { level: 1 });
    kit.routes.byUser.set(RSM, [R_RSM]);
    kit.routes.byUser.set(MR1, [R_MR1]);
    kit.routes.byUser.set(MR2, [R_MR2]);
    kit.doctors.set(RSM, [{ id: D_RSM, routeId: R_RSM }]);
    kit.doctors.set(MR1, [{ id: D_MR1, routeId: R_MR1 }]);
    kit.doctors.set(MR2, [{ id: D_MR2, routeId: R_MR2 }]);
    seed = new SeedDailyPlan(kit.dailyPlans, kit.views);
    submit = new SubmitDailyPlanUseCase(kit.dailyPlans, kit.deadlines, kit.submitter, kit.approvals, kit.carryOver, kit.monthlyApproved, kit.scope);
  });

  it('takes the routes and doctors of the team members named, and saves them as the manager’s own plan', async () => {
    await seed.execute(RSM, DATE, fieldDay());
    const saved = await kit.setManagerDay.execute(RSM, DATE, { workWith: [MR1, MR2], routeIds: [R_MR1, R_MR2], doctorIds: [D_MR1, D_MR2], remarks: null });
    expect(saved.workWith).toEqual([MR1, MR2]);
    expect(saved.routeIds).toEqual([R_MR1, R_MR2]);
    expect(saved.doctors.map((d) => d.doctorId)).toEqual([D_MR1, D_MR2]);
    expect(saved.source).toBe('MANUAL');
  });

  it('can still use the manager’s own routes and doctors alongside the team’s', async () => {
    await seed.execute(RSM, DATE, fieldDay());
    const saved = await kit.setManagerDay.execute(RSM, DATE, { workWith: [MR1], routeIds: [R_RSM, R_MR1], doctorIds: [D_RSM, D_MR1], remarks: null });
    expect(saved.doctors).toHaveLength(2);
  });

  it('refuses a route or doctor that is neither the manager’s nor a picked team member’s', async () => {
    await seed.execute(RSM, DATE, fieldDay());
    await expectError(kit.setManagerDay.execute(RSM, DATE, { workWith: [MR1], routeIds: [R_MR2], doctorIds: [], remarks: null }), 400);
    await expectError(kit.setManagerDay.execute(RSM, DATE, { workWith: [MR1], routeIds: [R_MR1], doctorIds: [D_MR2], remarks: null }), 400);
  });

  it('refuses someone outside the manager’s team', async () => {
    await seed.execute(RSM, DATE, fieldDay());
    await expectError(kit.setManagerDay.execute(RSM, DATE, { workWith: [STRANGER], routeIds: [R_RSM], doctorIds: [], remarks: null }), 400);
  });

  it('is refused for an MR', async () => {
    await seed.execute(MR1, DATE, fieldDay({ routeIds: [R_MR1] }));
    await expectError(kit.setManagerDay.execute(MR1, DATE, { workWith: [], routeIds: [R_MR1], doctorIds: [], remarks: null }), 403);
  });

  it('is refused once the plan is submitted, and submits with the team’s routes and doctors', async () => {
    const plan = await seed.execute(RSM, DATE, fieldDay());
    await kit.setManagerDay.execute(RSM, DATE, { workWith: [MR1], routeIds: [R_MR1], doctorIds: [D_MR1], remarks: null });
    const request = await submit.execute(RSM, plan.id);
    expect(request.status).toBe('SUBMITTED');
    await expectError(kit.setManagerDay.execute(RSM, DATE, { workWith: [], routeIds: [R_RSM], doctorIds: [], remarks: null }), 409);
  });

  it('fails the submit when a team member’s route is gone, rather than sending a route nobody covers', async () => {
    const plan = await seed.execute(RSM, DATE, fieldDay());
    await kit.setManagerDay.execute(RSM, DATE, { workWith: [MR1], routeIds: [R_MR1], doctorIds: [], remarks: null });
    kit.routes.byUser.set(MR1, []);
    await expectError(submit.execute(RSM, plan.id), 400);
  });

  it('allows a longer doctor list than an MR’s 50', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `d${String(i).padStart(23, '0')}`, routeId: R_MR1 }));
    kit.doctors.set(MR1, many);
    await seed.execute(RSM, DATE, fieldDay());
    const saved = await kit.setManagerDay.execute(RSM, DATE, { workWith: [MR1], routeIds: [R_MR1], doctorIds: many.map((d) => d.id), remarks: null });
    expect(saved.doctors).toHaveLength(60);
  });

  it('suggests each person’s own plan, falls back to their monthly entry, and merges', async () => {
    await seed.execute(MR1, DATE, fieldDay({ routeIds: [R_MR1] }));
    const suggestion = await kit.teamSuggest.execute(RSM, DATE, [MR1, MR2]);
    expect(suggestion.people.find((p) => p.userId === MR1)?.source).toBe('DAILY_PLAN');
    expect(suggestion.people.find((p) => p.userId === MR2)?.source).toBe('NONE');
    expect(suggestion.routeIds).toEqual([R_MR1]);
  });

  it('refuses a suggestion for someone outside the team', async () => {
    await expectError(kit.teamSuggest.execute(RSM, DATE, [STRANGER]), 400);
  });
});
