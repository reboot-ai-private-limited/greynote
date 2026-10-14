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

  const inherit = async (userId: string, o: Partial<PlanDay> = {}) => {
    await kit.dailyPlans.createInherited(userId, DATE, fieldDay(o));
    return (await kit.dailyPlans.findByUserAndDate(userId, DATE))!;
  };
  const input = (o: Partial<{ workWith: string[]; doctorIds: string[] }> = {}) => ({ workingType: 'FIELD_WORK' as const, workWith: [], doctorIds: [], ...o });

  it('takes the routes of the people picked and lets the doctors be chosen from theirs', async () => {
    await inherit(RSM);
    await seed.execute(MR1, DATE, fieldDay({ routeIds: [R_MR1] }));
    await seed.execute(MR2, DATE, fieldDay({ routeIds: [R_MR2] }));
    const saved = await kit.setDay.execute(RSM, DATE, input({ workWith: [MR1, MR2], doctorIds: [D_MR1, D_MR2] }));
    expect(saved.workWith).toEqual([MR1, MR2]);
    expect(saved.routeIds).toEqual([R_MR1, R_MR2]);
    expect(saved.doctors.map((d) => d.doctorId)).toEqual([D_MR1, D_MR2]);
    expect(saved).toMatchObject({ source: 'MANUAL', changedFromMonthly: true });
    expect(saved.plannedFrom).toMatchObject({ routeIds: [R_RSM], workWith: [] });
  });

  it('without anyone picked, the routes stay the monthly plan’s and the doctors are the manager’s own', async () => {
    await inherit(RSM);
    const saved = await kit.setDay.execute(RSM, DATE, input({ doctorIds: [D_RSM] }));
    expect(saved.routeIds).toEqual([R_RSM]);
    expect(saved.doctors.map((d) => d.doctorId)).toEqual([D_RSM]);
    expect(saved.changedFromMonthly).toBe(false);
  });

  it('picking people and then no one goes back to the monthly routes', async () => {
    await inherit(RSM);
    await seed.execute(MR1, DATE, fieldDay({ routeIds: [R_MR1] }));
    await kit.setDay.execute(RSM, DATE, input({ workWith: [MR1] }));
    const back = await kit.setDay.execute(RSM, DATE, input());
    expect(back).toMatchObject({ routeIds: [R_RSM], source: 'MONTHLY', plannedFrom: null });
  });

  it('refuses a doctor that is not on the people’s routes, and people outside the team or with no routes that day', async () => {
    await inherit(RSM);
    await seed.execute(MR1, DATE, fieldDay({ routeIds: [R_MR1] }));
    await expectError(kit.setDay.execute(RSM, DATE, input({ workWith: [MR1], doctorIds: [D_MR2] })), 400);
    await expectError(kit.setDay.execute(RSM, DATE, input({ workWith: [STRANGER] })), 400);
    await expectError(kit.setDay.execute(RSM, DATE, input({ workWith: [MR2] })), 400); // MR2 has nothing planned that day
  });

  it('an MR keeps the monthly routes and may name anyone active to work with', async () => {
    await inherit(MR1, { routeIds: [R_MR1] });
    const saved = await kit.setDay.execute(MR1, DATE, input({ workWith: [ASM], doctorIds: [D_MR1] }));
    expect(saved).toMatchObject({ routeIds: [R_MR1], workWith: [ASM] });
  });

  it('is refused once the plan is submitted, and submits with the team’s routes and doctors', async () => {
    const plan = await inherit(RSM);
    await seed.execute(MR1, DATE, fieldDay({ routeIds: [R_MR1] }));
    await kit.setDay.execute(RSM, DATE, input({ workWith: [MR1], doctorIds: [D_MR1] }));
    const request = await submit.execute(RSM, plan.id);
    expect(request.status).toBe('SUBMITTED');
    await expectError(kit.setDay.execute(RSM, DATE, input()), 409);
  });

  it('fails the submit when a team member’s route is gone, rather than sending a route nobody covers', async () => {
    const plan = await inherit(RSM);
    await seed.execute(MR1, DATE, fieldDay({ routeIds: [R_MR1] }));
    await kit.setDay.execute(RSM, DATE, input({ workWith: [MR1] }));
    kit.routes.byUser.set(MR1, []);
    await expectError(submit.execute(RSM, plan.id), 400);
  });

  it('allows a longer doctor list than an MR’s 50', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `d${String(i).padStart(23, '0')}`, routeId: R_MR1 }));
    kit.doctors.set(MR1, many);
    await inherit(RSM);
    await seed.execute(MR1, DATE, fieldDay({ routeIds: [R_MR1] }));
    const saved = await kit.setDay.execute(RSM, DATE, input({ workWith: [MR1], doctorIds: many.map((d) => d.id) }));
    expect(saved.doctors).toHaveLength(60);
  });

  it('suggests each person’s own plan, falls back to their monthly entry, and merges', async () => {
    await seed.execute(MR1, DATE, fieldDay({ routeIds: [R_MR1] }));
    const suggestion = await kit.teamSuggest.execute(RSM, DATE, [MR1, MR2]);
    expect(suggestion.people.find((p) => p.userId === MR1)?.source).toBe('DAILY_PLAN');
    expect(suggestion.people.find((p) => p.userId === MR2)?.source).toBe('NONE');
    expect(suggestion.routeIds).toEqual([R_MR1]);
  });

  it('falls back to a person’s monthly entry when they have no daily plan yet', async () => {
    await kit.monthlyPlans.save(MR2, '2026-10', [{ planDate: DATE, workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: [R_MR2], remarks: null, returnDate: null }], null);
    const suggestion = await kit.teamSuggest.execute(RSM, DATE, [MR2]);
    expect(suggestion.people[0]).toMatchObject({ source: 'MONTHLY_PLAN', routeIds: [R_MR2], doctorIds: [D_MR2] });
  });

  it('refuses a suggestion for someone outside the team', async () => {
    await expectError(kit.teamSuggest.execute(RSM, DATE, [STRANGER]), 400);
  });
});
