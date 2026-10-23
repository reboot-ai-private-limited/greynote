import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { appEvents } from '@/shared/events/appEvents.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import { AmendMonthlyPlanUseCase } from './amendMonthlyPlan.usecase.js';
import { Clock, planningKit } from './planningTestKit.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';
import { SubmitMonthlyPlanUseCase } from './submitMonthlyPlan.usecase.js';

const ADMIN = 'aaaaaaaaaaaaaaaaaaaaaaa0';
const RSM = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const MR = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const STRANGER = 'aaaaaaaaaaaaaaaaaaaaaaa4';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const OTHER_ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const FOREIGN_ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb3';
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

async function expectError(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
  return err as AppError;
}

describe('A manager amends a waiting Monthly Plan', () => {
  let kit: ReturnType<typeof planningKit>;
  let save: SaveMonthlyPlanUseCase;
  let submit: SubmitMonthlyPlanUseCase;
  let amend: AmendMonthlyPlanUseCase;
  let planId: string;
  const events: unknown[] = [];

  beforeEach(async () => {
    const clock = new Clock(new Date('2026-09-20T04:00:00Z'));
    kit = planningKit(clock);
    kit.users.add(ADMIN, { role: 'ADMIN' });
    kit.users.add(RSM, { level: 3 });
    kit.users.add(ASM, { level: 2, managerId: RSM });
    kit.users.add(MR, { managerId: ASM });
    kit.users.add(STRANGER);
    kit.routes.byUser.set(MR, [ROUTE, OTHER_ROUTE]);
    kit.routes.byUser.set(STRANGER, [FOREIGN_ROUTE]);
    kit.routes.types.set(OTHER_ROUTE, 'OUT_STATION');
    save = new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views);
    submit = new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter);
    amend = new AmendMonthlyPlanUseCase(kit.monthlyPlans, kit.users, kit.approvals, kit.submitter, kit.views, kit.offDays, clock.now);
    planId = (await save.execute(MR, MONTH, [entry('2026-10-05'), entry('2026-10-06')])).id;
    appEvents.clear();
    events.length = 0;
    appEvents.on('monthly.plan.amended', (e) => void events.push(e));
  });
  afterEach(() => appEvents.clear());

  const settle = () => new Promise((r) => setTimeout(r, 5));
  const submitted = () => submit.execute(MR, planId);
  const changed = [entry('2026-10-05', { routeIds: [OTHER_ROUTE] }), entry('2026-10-07')];

  it('replaces the days, keeps the old ones with the reason, and leaves the plan waiting', async () => {
    await submitted();
    const plan = await amend.execute({ id: ASM, role: 'FIELD' }, planId, changed, 'Cover the Kalyani route');

    expect(plan.status).toBe('SUBMITTED');
    expect(plan.entries.map((e) => [e.planDate, e.routeIds])).toEqual([['2026-10-05', [OTHER_ROUTE]], ['2026-10-07', [ROUTE]]]);
    expect(plan.amendments).toHaveLength(1);
    expect(plan.amendments[0]).toMatchObject({ by: ASM, reason: 'Cover the Kalyani route' });
    expect(plan.amendments[0]?.previous.map((e) => e.planDate)).toEqual(['2026-10-05', '2026-10-06']);
    expect(plan.revision).toBeGreaterThan(1);
  });

  it('tells the employee who changed it and why', async () => {
    await submitted();
    await amend.execute({ id: ASM, role: 'FIELD' }, planId, changed, 'Cover the Kalyani route');
    await settle();
    expect(events).toEqual([{ userId: MR, planId, planMonth: MONTH, by: ASM, byName: ASM, reason: 'Cover the Kalyani route' }]);
  });

  it('lets a manager higher up the chain and Admin do it too', async () => {
    await submitted();
    await amend.execute({ id: RSM, role: 'FIELD' }, planId, changed, 'Higher up');
    const plan = await amend.execute({ id: ADMIN, role: 'ADMIN' }, planId, changed, 'Admin');
    expect(plan.amendments.map((a) => a.by)).toEqual([RSM, ADMIN]);
  });

  it('refuses the employee, and a stranger sees no such plan', async () => {
    await submitted();
    await expectError(amend.execute({ id: MR, role: 'FIELD' }, planId, changed, 'x'), 403);
    await expectError(amend.execute({ id: STRANGER, role: 'FIELD' }, planId, changed, 'x'), 404);
    await expectError(amend.execute({ id: ASM, role: 'FIELD' }, 'missing', changed, 'x'), 404);
  });

  it('refuses a plan that is still a draft, was rejected, or is already approved', async () => {
    await expectError(amend.execute({ id: ASM, role: 'FIELD' }, planId, changed, 'x'), 409);
    await submitted();
    kit.approvals.setStatus('MONTHLY_PLAN', planId, 'REJECTED');
    await expectError(amend.execute({ id: ASM, role: 'FIELD' }, planId, changed, 'x'), 409);
    kit.approvals.setStatus('MONTHLY_PLAN', planId, 'MANAGER_APPROVED');
    const err = await expectError(amend.execute({ id: ASM, role: 'FIELD' }, planId, changed, 'x'), 409);
    expect(err.message).toMatch(/reopen/i);
    kit.approvals.setStatus('MONTHLY_PLAN', planId, 'APPROVED');
    await expectError(amend.execute({ id: ADMIN, role: 'ADMIN' }, planId, changed, 'x'), 409);
  });

  it('checks the days like the employee’s own plan', async () => {
    await submitted();
    const manager = { id: ASM, role: 'FIELD' as const };
    await expectError(amend.execute(manager, planId, [entry('2026-10-05', { routeIds: [FOREIGN_ROUTE] })], 'x'), 400);
    await expectError(amend.execute(manager, planId, [entry('2026-11-05')], 'x'), 400);
    await expectError(amend.execute(manager, planId, [entry('2026-10-05'), entry('2026-10-05')], 'x'), 400);
    expect((await kit.monthlyPlans.findById(planId))?.amendments).toEqual([]);
  });

  it('refuses days on the employee’s off days', async () => {
    await submitted();
    kit.offDays.bind(async () => [{ date: '2026-10-07', kind: 'HOLIDAY', name: 'Holiday' }] as never);
    await expectError(amend.execute({ id: ASM, role: 'FIELD' }, planId, changed, 'x'), 400);
  });

  it('refuses when the plan changed meanwhile', async () => {
    await submitted();
    const original = kit.monthlyPlans.amend.bind(kit.monthlyPlans);
    kit.monthlyPlans.amend = async (id, _rev, entries, amendment) => original(id, 0, entries, amendment);
    await expectError(amend.execute({ id: ASM, role: 'FIELD' }, planId, changed, 'x'), 409);
  });

  it('rebuilds a trip, and writes its days into next month', async () => {
    await submitted();
    const plan = await amend.execute({ id: ASM, role: 'FIELD' }, planId, [entry('2026-10-30', { returnDate: '2026-11-02', routeIds: [OTHER_ROUTE] })], 'Trip');
    expect(plan.entries.map((e) => e.planDate)).toEqual(['2026-10-30', '2026-10-31']);
    const next = await kit.monthlyPlans.findByUserAndMonth(MR, '2026-11');
    expect(next?.entries.map((e) => [e.planDate, e.dayKind])).toEqual([['2026-11-01', 'STAY'], ['2026-11-02', 'TRANSIT']]);
  });

  it('is refused, before anything changes, when next month’s plan is already waiting', async () => {
    const november = await save.execute(MR, '2026-11', [entry('2026-11-10')]);
    await submit.execute(MR, november.id);
    await submitted();
    await expectError(amend.execute({ id: ASM, role: 'FIELD' }, planId, [entry('2026-10-30', { returnDate: '2026-11-02', routeIds: [OTHER_ROUTE] })], 'Trip'), 409);
    expect((await kit.monthlyPlans.findById(planId))?.amendments).toEqual([]);
  });
});
