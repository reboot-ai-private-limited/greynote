import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import { AmendMonthlyPlanUseCase } from './amendMonthlyPlan.usecase.js';
import { DeleteMonthlyPlanUseCase } from './deleteMonthlyPlan.usecase.js';
import { Clock, inlineTransactions, planningKit } from './planningTestKit.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';
import { SubmitMonthlyPlanUseCase } from './submitMonthlyPlan.usecase.js';

const ADMIN = 'aaaaaaaaaaaaaaaaaaaaaaa0';
const HR = 'aaaaaaaaaaaaaaaaaaaaaaa5';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const MR = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const OUT = 'bbbbbbbbbbbbbbbbbbbbbbb2';
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
const trip = (planDate: string, returnDate: string) => entry(planDate, { routeIds: [OUT], returnDate });

async function expectError(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
  return err as AppError;
}

describe('Admin and HR edit an approved Monthly Plan', () => {
  let kit: ReturnType<typeof planningKit>;
  let clock: Clock;
  let save: SaveMonthlyPlanUseCase;
  let amend: AmendMonthlyPlanUseCase;
  let planId: string;
  const admin = { id: ADMIN, role: 'ADMIN' as const };

  /** Sent and approved in September, as it would be; the tests then run on 10 October. */
  async function approveWith(entries: MonthlyPlanEntry[]) {
    clock.set('2026-09-20T04:00:00Z');
    planId = (await save.execute(MR, MONTH, entries)).id;
    await new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter).execute(MR, planId);
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'APPROVED');
    clock.set('2026-10-10T04:00:00Z');
  }

  beforeEach(() => {
    clock = new Clock(new Date('2026-10-10T04:00:00Z'));
    kit = planningKit(clock);
    kit.users.add(ADMIN, { role: 'ADMIN' });
    kit.users.add(HR, { role: 'HR' });
    kit.users.add(ASM, { level: 2 });
    kit.users.add(MR, { managerId: ASM });
    kit.routes.byUser.set(MR, [ROUTE, OUT]);
    kit.routes.types.set(OUT, 'OUT_STATION');
    save = new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views);
    amend = new AmendMonthlyPlanUseCase(kit.monthlyPlans, kit.users, kit.approvals, kit.submitter, kit.views, kit.offDays, clock.now, {
      deadlines: kit.deadlines,
      daily: kit.dailyPlans,
      transactions: inlineTransactions,
    });
  });

  it('changes a later day, stays approved, and brings the untouched daily plan along without a reason', async () => {
    await approveWith([entry('2026-10-15'), entry('2026-10-16')]);
    const plan = await amend.execute({ id: HR, role: 'HR' }, planId, [entry('2026-10-15', { remarks: 'new' }), entry('2026-10-16')], '');
    expect(plan.status).toBe('APPROVED');
    expect(plan.amendments).toHaveLength(1);
    expect((await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))?.remarks).toBe('new');
  });

  it('adds a day and drops one, with their daily plans', async () => {
    await approveWith([entry('2026-10-15'), entry('2026-10-16')]);
    await amend.execute(admin, planId, [entry('2026-10-15'), entry('2026-10-17')], '');
    expect(await kit.dailyPlans.findByUserAndDate(MR, '2026-10-16')).toBeNull();
    expect(await kit.dailyPlans.findByUserAndDate(MR, '2026-10-17')).not.toBeNull();
  });

  it('refuses today and earlier days', async () => {
    await approveWith([entry('2026-10-09'), entry('2026-10-10'), entry('2026-10-15')]);
    const err = await expectError(amend.execute(admin, planId, [entry('2026-10-09'), entry('2026-10-10', { remarks: 'x' }), entry('2026-10-15')], ''), 409);
    expect(err.message).toMatch(/today/);
    await expectError(amend.execute(admin, planId, [entry('2026-10-10'), entry('2026-10-15')], ''), 409);
  });

  it('shortens a trip that has begun, but not to end today or before', async () => {
    await approveWith([trip('2026-10-09', '2026-10-13')]);
    // Stay 10 (today), 11, 12, transit 13. Return on the 12th: 13th goes, 12th becomes transit.
    const plan = await amend.execute(admin, planId, [trip('2026-10-09', '2026-10-12')], '');
    expect(plan.entries.map((e) => [e.planDate, e.dayKind])).toEqual([['2026-10-09', 'NORMAL'], ['2026-10-10', 'STAY'], ['2026-10-11', 'STAY'], ['2026-10-12', 'TRANSIT']]);
    // Return today would turn today's stay day into a transit day.
    await expectError(amend.execute(admin, planId, [trip('2026-10-09', '2026-10-10')], ''), 409);
    // Extending is fine.
    const longer = await amend.execute(admin, planId, [trip('2026-10-09', '2026-10-14')], '');
    expect(longer.entries.at(-1)).toMatchObject({ planDate: '2026-10-14', dayKind: 'TRANSIT' });
  });

  it('does not let a trip that has begun lose its start day or be cancelled into today', async () => {
    await approveWith([trip('2026-10-09', '2026-10-13')]);
    await expectError(amend.execute(admin, planId, [entry('2026-10-12')], ''), 409);
  });

  it('refuses when the employee already changed or sent the daily plan, naming the day', async () => {
    await approveWith([entry('2026-10-15'), entry('2026-10-16')]);
    const day = await kit.dailyPlans.findByUserAndDate(MR, '2026-10-16');
    await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: day!.id, submitterId: MR });
    const err = await expectError(amend.execute(admin, planId, [entry('2026-10-15'), entry('2026-10-16', { remarks: 'x' })], ''), 409);
    expect(err.message).toMatch(/Fri, 16 Oct/);
    expect((await kit.monthlyPlans.findById(planId))?.amendments).toHaveLength(0);
  });

  it('is still refused for a manager', async () => {
    await approveWith([entry('2026-10-15')]);
    await expectError(amend.execute({ id: ASM, role: 'FIELD' }, planId, [entry('2026-10-15', { remarks: 'x' })], ''), 409);
  });
});

describe('Admin deletes a Monthly Plan', () => {
  let kit: ReturnType<typeof planningKit>;
  let del: DeleteMonthlyPlanUseCase;
  const admin = { id: ADMIN, role: 'ADMIN' as const };

  beforeEach(() => {
    const clock = new Clock(new Date('2026-10-10T04:00:00Z'));
    kit = planningKit(clock);
    kit.users.add(ADMIN, { role: 'ADMIN' });
    kit.users.add(MR);
    kit.routes.byUser.set(MR, [ROUTE]);
    del = new DeleteMonthlyPlanUseCase(kit.monthlyPlans, kit.dailyPlans, kit.approvals, kit.deadlines, inlineTransactions);
  });

  it('removes a future month, its approval and its daily plans', async () => {
    const save = new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views);
    const plan = await save.execute(MR, '2026-11', [entry('2026-11-03')]);
    await new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter).execute(MR, plan.id);
    await kit.approvals.decide('MONTHLY_PLAN', plan.id, 'APPROVED');
    expect(await kit.dailyPlans.findByUserAndDate(MR, '2026-11-03')).not.toBeNull();

    await del.execute(admin, plan.id);
    expect(await kit.monthlyPlans.findById(plan.id)).toBeNull();
    expect(await kit.dailyPlans.findByUserAndDate(MR, '2026-11-03')).toBeNull();
    expect(await kit.approvals.getForRecord('MONTHLY_PLAN', plan.id)).toBeNull();
  });

  it('refuses a month that has started, and anyone but Admin', async () => {
    const save = new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views);
    const now = await save.execute(MR, '2026-10', [entry('2026-10-20')]);
    await expectError(del.execute(admin, now.id), 409);
    const later = await save.execute(MR, '2026-11', [entry('2026-11-03')]);
    await expectError(del.execute({ id: HR, role: 'HR' }, later.id), 403);
  });
});
