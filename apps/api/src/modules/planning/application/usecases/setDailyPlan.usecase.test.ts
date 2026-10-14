import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { PlanDay } from '../../domain/plan.js';
import { Clock, planningKit } from './planningTestKit.js';
import { SubmitDailyPlanUseCase } from './submitDailyPlan.usecase.js';

const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const MR = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const ROUTE2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const OUT = 'bbbbbbbbbbbbbbbbbbbbbbb3';
const DOC = 'cccccccccccccccccccccc01';
const DOC2 = 'cccccccccccccccccccccc02';
const DATE = '2026-10-05';

const day = (o: Partial<PlanDay> = {}): PlanDay => ({ workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: [ROUTE], remarks: null, ...o });
const edit = (o: Partial<{ workingType: PlanDay['workingType']; workWith: string[]; doctorIds: string[] }> = {}) => ({ workingType: 'FIELD_WORK' as const, workWith: [], doctorIds: [], ...o });

async function expectError(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
}

describe('Changing my own Daily Plan', () => {
  let kit: ReturnType<typeof planningKit>;
  let submit: SubmitDailyPlanUseCase;

  beforeEach(async () => {
    kit = planningKit(new Clock(new Date('2026-10-05T04:00:00Z')));
    kit.users.add(ASM, { level: 2 });
    kit.users.add(MR, { managerId: ASM });
    kit.routes.byUser.set(MR, [ROUTE, ROUTE2, OUT]);
    kit.routes.types.set(OUT, 'OUT_STATION');
    kit.doctors.set(MR, [{ id: DOC, routeId: ROUTE }, { id: DOC2, routeId: ROUTE2 }]);
    await kit.dailyPlans.createInherited(MR, DATE, day());
    submit = new SubmitDailyPlanUseCase(kit.dailyPlans, kit.deadlines, kit.submitter, kit.approvals, kit.carryOver, kit.monthlyApproved, kit.scope);
  });

  it('keeps what the monthly plan said on the first change, and the day is the employee’s own', async () => {
    const saved = await kit.setDay.execute(MR, DATE, edit({ workWith: [ASM], doctorIds: [DOC] }));
    expect(saved).toMatchObject({ source: 'MANUAL', routeIds: [ROUTE], remarks: null, workWith: [ASM], changedFromMonthly: true });
    expect(saved.plannedFrom).toMatchObject({ workingType: 'FIELD_WORK', routeIds: [ROUTE], workWith: [] });
  });

  it('keeps the first original through later changes, and clears the flag when the day goes back to the monthly one', async () => {
    await kit.setDay.execute(MR, DATE, edit({ workWith: [ASM] }));
    const again = await kit.setDay.execute(MR, DATE, edit({ workingType: 'MEETING' }));
    expect(again.plannedFrom).toMatchObject({ workingType: 'FIELD_WORK', routeIds: [ROUTE] });
    const back = await kit.setDay.execute(MR, DATE, edit());
    expect(back).toMatchObject({ source: 'MONTHLY', plannedFrom: null, routeIds: [ROUTE] });
  });

  it('a switch to a meeting clears routes and doctors; a switch back restores the monthly routes', async () => {
    await kit.setDay.execute(MR, DATE, edit({ doctorIds: [DOC] }));
    const meeting = await kit.setDay.execute(MR, DATE, edit({ workingType: 'MEETING' }));
    expect(meeting).toMatchObject({ workingType: 'MEETING', routeIds: [], doctors: [] });
    const campaign = await kit.setDay.execute(MR, DATE, edit({ workingType: 'DOCTOR_CAMPAIGN', doctorIds: [DOC] }));
    expect(campaign).toMatchObject({ workingType: 'DOCTOR_CAMPAIGN', routeIds: [ROUTE] });
    expect(campaign.doctors.map((d) => d.doctorId)).toEqual([DOC]);
  });

  it('a day the monthly plan made a meeting cannot become field work: it has no routes', async () => {
    await kit.dailyPlans.createInherited(MR, '2026-10-08', day({ workingType: 'MEETING', routeIds: [] }));
    await expectError(kit.setDay.execute(MR, '2026-10-08', edit()), 400);
  });

  it('refuses doctors on a day that is not field work, and a doctor off the day’s routes', async () => {
    await expectError(kit.setDay.execute(MR, DATE, edit({ workingType: 'MEETING', doctorIds: [DOC] })), 400);
    await expectError(kit.setDay.execute(MR, DATE, edit({ doctorIds: [DOC2] })), 400);
  });

  it('a trip’s stay and transit days cannot change type; their routes stay', async () => {
    await kit.dailyPlans.createInherited(MR, '2026-10-06', day({ dayKind: 'STAY', routeIds: [OUT] }));
    await expectError(kit.setDay.execute(MR, '2026-10-06', edit({ workingType: 'MEETING' })), 400);
    const ok = await kit.setDay.execute(MR, '2026-10-06', edit({ workWith: [ASM] }));
    expect(ok).toMatchObject({ routeIds: [OUT], dayKind: 'STAY', workWith: [ASM] });
  });

  it('is refused once the plan is waiting for approval, and the changed day submits', async () => {
    const plan = await kit.setDay.execute(MR, DATE, edit({ workingType: 'MEETING' }));
    expect((await submit.execute(MR, plan.id)).status).toBe('SUBMITTED');
    await expectError(kit.setDay.execute(MR, DATE, edit()), 409);
  });

  it('is refused for a day the monthly plan did not cover', async () => {
    await expectError(kit.setDay.execute(MR, '2026-10-20', edit()), 404);
  });
});
