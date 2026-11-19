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
  const input = (o: Partial<{ workWith: string[]; doctorIds: string[]; routeIds: string[] }> = {}) => ({ workingType: 'FIELD_WORK' as const, workWith: [] as string[], doctorIds: [] as string[], ...o });

  // The RSM's approved day covers two routes held by MRs below them (a manager plans the routes of their team).
  const approvedDay = (o: Partial<PlanDay> = {}) => inherit(RSM, { routeIds: [R_MR1, R_MR2], ...o });
  const route = (...routeIds: string[]) => ({ routeIds });

  it('a manager’s day has the Tour Plan’s routes: a route chosen is ignored (decision-log 2026-11-19)', async () => {
    await approvedDay();
    const saved = await kit.setDay.execute(RSM, DATE, input({ ...route(R_MR1), workWith: [MR1], doctorIds: [D_MR1] }));
    expect(saved).toMatchObject({ routeIds: [R_MR1, R_MR2], workWith: [MR1] });
    expect(saved.doctors.map((d) => d.doctorId)).toEqual([D_MR1]);
  });

  it('without a route chosen the day keeps all the approved routes', async () => {
    await approvedDay();
    const saved = await kit.setDay.execute(RSM, DATE, input({ workWith: [MR1, MR2], doctorIds: [D_MR1, D_MR2] }));
    expect(saved).toMatchObject({ routeIds: [R_MR1, R_MR2], source: 'MONTHLY', changedFromMonthly: false });
  });

  it('refuses a person who does not hold the chosen route, and says who to ask', async () => {
    await approvedDay({ routeIds: [R_MR1] });
    const err = await expectError(kit.setDay.execute(RSM, DATE, input({ workWith: [MR2] })), 400);
    expect(err.message).toContain('Ask your manager or Admin');
  });

  it('refuses a doctor on another route, even a downline doctor, and a doctor outside the downline', async () => {
    await approvedDay({ routeIds: [R_MR1] });
    kit.doctors.set(STRANGER, [{ id: 'd-stranger', routeId: R_MR1 }]);
    await expectError(kit.setDay.execute(RSM, DATE, input({ doctorIds: [D_MR2] })), 400);
    await expectError(kit.setDay.execute(RSM, DATE, input({ doctorIds: ['d-stranger'] })), 400);
    await expectError(kit.setDay.execute(RSM, DATE, input({ workWith: [STRANGER] })), 400);
  });

  it('lets a manager pick the downline doctors on the chosen route without naming anyone in Works with', async () => {
    await approvedDay();
    const saved = await kit.setDay.execute(RSM, DATE, input({ ...route(R_MR1, R_MR2), doctorIds: [D_MR1, D_MR2] }));
    expect(saved.doctors.map((d) => d.doctorId)).toEqual([D_MR1, D_MR2]);
  });

  it('the manager between the RSM and the MRs can be picked: a route’s holders and the managers above them', async () => {
    await approvedDay();
    const saved = await kit.setDay.execute(RSM, DATE, input({ ...route(R_MR1), workWith: [ASM, MR1] }));
    expect(saved.workWith).toEqual([ASM, MR1]);
  });

  it('a route outside the day’s approved ones, or none, is ignored: only a Tour Plan change moves a route', async () => {
    await approvedDay({ routeIds: [R_MR1] });
    expect((await kit.setDay.execute(RSM, DATE, input(route(R_MR2)))).routeIds).toEqual([R_MR1]);
    expect((await kit.setDay.execute(RSM, DATE, input(route()))).routeIds).toEqual([R_MR1]);
  });

  it('a route nobody below holds leaves Works with empty: nobody can be picked', async () => {
    await approvedDay({ routeIds: [R_RSM] }); // only the RSM holds it
    await expectError(kit.setDay.execute(RSM, DATE, input({ workWith: [MR1] })), 400);
    const alone = await kit.setDay.execute(RSM, DATE, input({ doctorIds: [D_RSM] }));
    expect(alone.doctors.map((d) => d.doctorId)).toEqual([D_RSM]);
  });

  it('an MR keeps the monthly routes and may name anyone active to work with', async () => {
    await inherit(MR1, { routeIds: [R_MR1] });
    const saved = await kit.setDay.execute(MR1, DATE, input({ workWith: [ASM], doctorIds: [D_MR1], routeIds: [R_MR2] }));
    expect(saved).toMatchObject({ routeIds: [R_MR1], workWith: [ASM] }); // an MR's routes are the plan's; routeIds is ignored
  });

  it('is refused once the plan is submitted, and submits with the team’s routes and doctors', async () => {
    const plan = await approvedDay();
    await kit.setDay.execute(RSM, DATE, input({ ...route(R_MR1), workWith: [MR1], doctorIds: [D_MR1] }));
    const request = await submit.execute(RSM, plan.id);
    expect(request.status).toBe('SUBMITTED');
    await expectError(kit.setDay.execute(RSM, DATE, input()), 409);
  });

  it('fails the submit when nobody below holds the route any more, rather than sending a route nobody covers', async () => {
    const plan = await approvedDay();
    await kit.setDay.execute(RSM, DATE, input({ ...route(R_MR1), workWith: [MR1] }));
    kit.routes.byUser.set(MR1, []);
    await expectError(submit.execute(RSM, plan.id), 400);
  });

  it('a manager moved to another team no longer has the old team’s routes', async () => {
    await approvedDay();
    kit.users.add(RSM, { level: 3 }); // unchanged
    kit.users.add(MR1, { level: 1, managerId: STRANGER });
    kit.users.add(MR2, { level: 1, managerId: STRANGER });
    kit.users.add(ASM, { level: 2, managerId: STRANGER });
    await expectError(kit.setDay.execute(RSM, DATE, input({ ...route(R_MR1), doctorIds: [D_MR1] })), 400);
  });

  it('allows a longer doctor list than an MR’s 50', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `d${String(i).padStart(23, '0')}`, routeId: R_MR1 }));
    kit.doctors.set(MR1, many);
    await approvedDay();
    const saved = await kit.setDay.execute(RSM, DATE, input({ ...route(R_MR1), workWith: [MR1], doctorIds: many.map((d) => d.id) }));
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
