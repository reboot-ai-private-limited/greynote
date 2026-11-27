import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { PlanDay } from '../../domain/plan.js';
import { Clock, planningKit, SeedDailyPlan } from './planningTestKit.js';
import { SubmitDailyPlanUseCase } from './submitDailyPlan.usecase.js';
import { WorkWithOptionsUseCase } from './workWithOptions.usecase.js';

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

  it('a route outside the day’s approved ones, or none, is ignored: only a Tour Plan change moves a route', async () => {
    await approvedDay({ routeIds: [R_MR1] });
    expect((await kit.setDay.execute(RSM, DATE, input(route(R_MR2)))).routeIds).toEqual([R_MR1]);
    expect((await kit.setDay.execute(RSM, DATE, input(route()))).routeIds).toEqual([R_MR1]);
  });

  it('an MR keeps the monthly routes and may name anyone active to work with', async () => {
    await inherit(MR1, { routeIds: [R_MR1] });
    const saved = await kit.setDay.execute(MR1, DATE, input({ workWith: [ASM], doctorIds: [D_MR1], routeIds: [R_MR2] }));
    expect(saved).toMatchObject({ routeIds: [R_MR1], workWith: [ASM] }); // an MR's routes are the plan's; routeIds is ignored
  });

  it('a manager moved to another team no longer has the old team’s routes', async () => {
    await approvedDay();
    kit.users.add(RSM, { level: 3 }); // unchanged
    kit.users.add(MR1, { level: 1, managerId: STRANGER });
    kit.users.add(MR2, { level: 1, managerId: STRANGER });
    kit.users.add(ASM, { level: 2, managerId: STRANGER });
    await expectError(kit.setDay.execute(RSM, DATE, input({ ...route(R_MR1), doctorIds: [D_MR1] })), 400);
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

describe('A manager’s day: work with the team approved at the same place, call their doctors (2026-11-27)', () => {
  let kit: ReturnType<typeof planningKit>;
  let submit: SubmitDailyPlanUseCase;
  const atPlace = (place: string): Partial<PlanDay> => ({ routeIds: [], fromPlaceId: place, toPlaceId: place });
  const inherit = async (userId: string, o: Partial<PlanDay>) => {
    await kit.dailyPlans.createInherited(userId, DATE, fieldDay(o));
    return (await kit.dailyPlans.findByUserAndDate(userId, DATE))!;
  };
  /** A team member's day at a place with these doctors, in this approval state. */
  const teamDay = async (userId: string, place: string, doctorIds: string[], status: 'APPROVED' | 'MANAGER_APPROVED' | 'SUBMITTED') => {
    const plan = await inherit(userId, atPlace(place));
    await kit.dailyPlans.saveDoctors(plan.id, plan.revision, doctorIds.map((doctorId) => ({ doctorId, carriedFrom: null })));
    await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: plan.id, submitterId: userId });
    if (status !== 'SUBMITTED') kit.approvals.setStatus('DAILY_PLAN', plan.id, status);
  };
  const input = (o: Partial<{ workWith: string[]; doctorIds: string[] }> = {}) => ({ workingType: 'FIELD_WORK' as const, workWith: [] as string[], doctorIds: [] as string[], ...o });

  beforeEach(async () => {
    kit = planningKit(new Clock(new Date('2026-10-05T04:00:00Z')));
    kit.users.add(RSM, { level: 3 });
    kit.users.add(ASM, { level: 2, managerId: RSM });
    kit.users.add(MR1, { level: 1, managerId: ASM });
    kit.users.add(MR2, { level: 1, managerId: ASM });
    kit.users.add(STRANGER, { level: 1 });
    for (const u of [RSM, ASM, MR1, MR2, STRANGER]) kit.routes.placesByUser.set(u, ['p1', 'p2']);
    kit.doctors.set(MR1, [{ id: D_MR1, routeId: R_MR1, placeId: 'p1' } as { id: string; routeId: string }]);
    kit.doctors.set(MR2, [{ id: D_MR2, routeId: R_MR2, placeId: 'p2' } as { id: string; routeId: string }]);
    submit = new SubmitDailyPlanUseCase(kit.dailyPlans, kit.deadlines, kit.submitter, kit.approvals, kit.carryOver, kit.monthlyApproved, kit.scope);
    await teamDay(MR1, 'p1', [D_MR1], 'APPROVED');
    await teamDay(MR2, 'p2', [D_MR2], 'APPROVED');
    await teamDay(ASM, 'p1', [], 'SUBMITTED');
    await teamDay(STRANGER, 'p1', [], 'APPROVED');
  });

  it('offers only people below whose plan for that day is approved and goes to the same place', async () => {
    expect((await kit.scope.teamAtPlace(RSM, DATE, 'p1')).map((p) => p.userId)).toEqual([MR1]);
    expect((await kit.scope.teamAtPlace(RSM, DATE, 'p2')).map((p) => p.userId)).toEqual([MR2]);
  });

  it('lists those people with their planned doctors for the manager’s own day; nobody for an MR', async () => {
    await inherit(RSM, atPlace('p1'));
    const options = new WorkWithOptionsUseCase(kit.dailyPlans, kit.users, kit.scope);
    expect(await options.execute(RSM, DATE)).toMatchObject({ toPlaceId: 'p1', people: [{ id: MR1, doctorIds: [D_MR1] }] });
    expect((await options.execute(MR1, DATE)).people).toEqual([]);
  });

  it('the manager picks no doctors: theirs are the planned doctors of the people they work with', async () => {
    await inherit(RSM, atPlace('p1'));
    const saved = await kit.setDay.execute(RSM, DATE, input({ workWith: [MR1], doctorIds: [D_MR2] }));
    expect(saved.workWith).toEqual([MR1]);
    expect(saved.doctors.map((d) => d.doctorId)).toEqual([D_MR1]);
  });

  it('refuses someone not approved at that place; with nobody to work with there are no doctors', async () => {
    await inherit(RSM, atPlace('p1'));
    const err = await expectError(kit.setDay.execute(RSM, DATE, input({ workWith: [MR2] })), 400);
    expect(err.message).toContain('approved and goes to the same place');
    await expectError(kit.setDay.execute(RSM, DATE, input({ workWith: [ASM] })), 400);
    await expectError(kit.setDay.execute(RSM, DATE, input({ workWith: [STRANGER] })), 400);
    const alone = await kit.setDay.execute(RSM, DATE, input({ doctorIds: [D_MR1] }));
    expect(alone.doctors).toEqual([]);
  });

  it('a manager has no carry-over, and the submit refreshes the doctors from the team', async () => {
    expect(await kit.carryOver.pending(RSM, DATE)).toEqual([]);
    const plan = await inherit(RSM, atPlace('p1'));
    await kit.setDay.execute(RSM, DATE, input({ workWith: [MR1] }));
    const mr1 = (await kit.dailyPlans.findByUserAndDate(MR1, DATE))!;
    await kit.dailyPlans.saveDoctors(mr1.id, mr1.revision, []);
    expect((await submit.execute(RSM, plan.id)).status).toBe('SUBMITTED');
    expect((await kit.dailyPlans.findByUserAndDate(RSM, DATE))!.doctors).toEqual([]);
  });
});

