import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import { MONTHLY_PLAN_CHANGE, changeRecordId } from '../monthlyPlanChange.js';
import { AmendMonthlyPlanUseCase } from './amendMonthlyPlan.usecase.js';
import { Clock, inlineTransactions, planningKit } from './planningTestKit.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';
import { SubmitDailyPlanUseCase } from './submitDailyPlan.usecase.js';
import { SubmitMonthlyPlanUseCase } from './submitMonthlyPlan.usecase.js';

const ADMIN = 'aaaaaaaaaaaaaaaaaaaaaaa0';
const RSM = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const MR = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const STRANGER = 'aaaaaaaaaaaaaaaaaaaaaaa9';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const OTHER_ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb3';
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

async function refusal(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}
const reasonOf = (err: AppError) => (err.publicDetails as { reason?: string } | undefined)?.reason;

describe('A manager changes an approved Tour Plan: it waits for the manager above (decision-log 2026-11-19)', () => {
  let kit: ReturnType<typeof planningKit>;
  let clock: Clock;
  let save: SaveMonthlyPlanUseCase;
  let amend: AmendMonthlyPlanUseCase;
  let planId: string;
  const asm = { id: ASM, role: 'FIELD' as const };

  async function approveWith(entries: MonthlyPlanEntry[]) {
    clock.set('2026-09-20T04:00:00Z');
    planId = (await save.execute(MR, MONTH, entries)).id;
    await new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter).execute(MR, planId);
    await kit.approvals.decide('MONTHLY_PLAN', planId, 'APPROVED');
    clock.set('2026-10-10T04:00:00Z');
  }
  const plan = () => kit.monthlyPlans.findById(planId);
  const pendingRecord = async () => changeRecordId(planId, (await plan())!.pendingChange!.id);

  beforeEach(() => {
    clock = new Clock(new Date('2026-10-10T04:00:00Z'));
    kit = planningKit(clock);
    kit.users.add(ADMIN, { role: 'ADMIN' });
    kit.users.add(RSM, { level: 3 });
    kit.users.add(ASM, { level: 2, managerId: RSM });
    kit.users.add(MR, { managerId: ASM });
    kit.users.add(STRANGER);
    kit.routes.byUser.set(MR, [ROUTE, OTHER_ROUTE]);
    save = new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views);
    amend = new AmendMonthlyPlanUseCase(kit.monthlyPlans, kit.users, kit.approvals, kit.submitter, kit.views, kit.offDays, clock.now, { deadlines: kit.deadlines, daily: kit.dailyPlans, transactions: inlineTransactions }, undefined, kit.propose);
  });

  it('sends a change request and changes nothing yet', async () => {
    await approveWith([entry('2026-10-15'), entry('2026-10-16')]);
    const view = await amend.execute(asm, planId, [entry('2026-10-15', { routeIds: [OTHER_ROUTE] }), entry('2026-10-16')], 'Customer moved');
    expect(view.status).toBe('APPROVED');
    expect(view.pendingChange).toMatchObject({ by: ASM, reason: 'Customer moved' });
    expect((await plan())!.entries[0]?.routeIds).toEqual([ROUTE]);
    expect((await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))?.routeIds).toEqual([ROUTE]);
    expect((await kit.approvals.getForRecord(MONTHLY_PLAN_CHANGE, await pendingRecord()))?.status).toBe('SUBMITTED');
  });

  it('applies when approved: the month, the untouched daily plan and the history change; the request is cleared', async () => {
    await approveWith([entry('2026-10-15'), entry('2026-10-16')]);
    await amend.execute(asm, planId, [entry('2026-10-15', { routeIds: [OTHER_ROUTE] }), entry('2026-10-16')], 'Customer moved');
    await kit.approvals.decide(MONTHLY_PLAN_CHANGE, await pendingRecord(), 'APPROVED');
    const after = (await plan())!;
    expect(after.entries[0]?.routeIds).toEqual([OTHER_ROUTE]);
    expect(after.pendingChange).toBeUndefined();
    expect(after.amendments.at(-1)).toMatchObject({ by: ASM, reason: 'Customer moved' });
    expect((await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))?.routeIds).toEqual([OTHER_ROUTE]);
  });

  it('a rejection drops it, and a new one can be sent', async () => {
    await approveWith([entry('2026-10-15')]);
    await amend.execute(asm, planId, [entry('2026-10-15', { remarks: 'a' })], '');
    await kit.approvals.decide(MONTHLY_PLAN_CHANGE, await pendingRecord(), 'REJECTED');
    expect((await plan())!.pendingChange).toBeUndefined();
    expect((await plan())!.entries[0]?.remarks).toBeNull();
    await amend.execute(asm, planId, [entry('2026-10-15', { remarks: 'b' })], '');
    expect((await plan())!.pendingChange?.entries[0]?.remarks).toBe('b');
  });

  it('only one change waits at a time', async () => {
    await approveWith([entry('2026-10-15')]);
    await amend.execute(asm, planId, [entry('2026-10-15', { remarks: 'a' })], '');
    expect(reasonOf(await refusal(amend.execute({ id: RSM, role: 'FIELD' }, planId, [entry('2026-10-15', { remarks: 'b' })], '')))).toBe('PLAN_CHANGE_PENDING');
  });

  it('refuses a past or today day when it is sent, and a change that changes nothing', async () => {
    await approveWith([entry('2026-10-09'), entry('2026-10-10'), entry('2026-10-15')]);
    expect(reasonOf(await refusal(amend.execute(asm, planId, [entry('2026-10-09', { remarks: 'x' }), entry('2026-10-10'), entry('2026-10-15')], '')))).toBe('PLAN_DAY_LOCKED');
    expect(reasonOf(await refusal(amend.execute(asm, planId, [entry('2026-10-09'), entry('2026-10-10', { remarks: 'x' }), entry('2026-10-15')], '')))).toBe('PLAN_DAY_LOCKED');
    expect((await refusal(amend.execute(asm, planId, [entry('2026-10-09'), entry('2026-10-10'), entry('2026-10-15')], ''))).statusCode).toBe(400);
  });

  it('checks the past-day rule again at approval: a day that became past while it waited cannot be approved', async () => {
    await approveWith([entry('2026-10-12'), entry('2026-10-20')]);
    await amend.execute(asm, planId, [entry('2026-10-12', { remarks: 'late change' }), entry('2026-10-20')], '');
    clock.set('2026-10-12T04:00:00Z'); // the 12th is today now
    const err = await refusal(kit.approvals.decide(MONTHLY_PLAN_CHANGE, await pendingRecord(), 'APPROVED'));
    expect(err.statusCode).toBe(409);
    expect(err.message).toContain('Reject it and ask the manager to send it again');
    expect((await plan())!.entries[0]?.remarks).toBeNull();
    expect((await plan())!.pendingChange).toBeDefined();
  });

  it('checks the sent-day rule again at approval: the employee sent that day meanwhile', async () => {
    await approveWith([entry('2026-10-15'), entry('2026-10-16')]);
    await amend.execute(asm, planId, [entry('2026-10-15', { remarks: 'x' }), entry('2026-10-16')], '');
    const day = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))!;
    await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: day.id, submitterId: MR });
    const err = await refusal(kit.approvals.decide(MONTHLY_PLAN_CHANGE, await pendingRecord(), 'APPROVED'));
    expect(err.statusCode).toBe(409);
    expect((await plan())!.entries[0]?.remarks).toBeNull();
  });

  it('refuses to approve when someone changed the month after it was sent', async () => {
    await approveWith([entry('2026-10-15'), entry('2026-10-16')]);
    await amend.execute(asm, planId, [entry('2026-10-15', { remarks: 'asm' }), entry('2026-10-16')], '');
    // Admin changes the other day directly meanwhile.
    await amend.execute({ id: ADMIN, role: 'ADMIN' }, planId, [entry('2026-10-15'), entry('2026-10-16', { remarks: 'admin' })], '');
    const err = await refusal(kit.approvals.decide(MONTHLY_PLAN_CHANGE, await pendingRecord(), 'APPROVED'));
    expect(reasonOf(err)).toBe('PLAN_CHANGED_SINCE');
  });

  it('Admin still changes an approved month at once; someone outside the chain cannot send one', async () => {
    await approveWith([entry('2026-10-15')]);
    await amend.execute({ id: ADMIN, role: 'ADMIN' }, planId, [entry('2026-10-15', { remarks: 'now' })], '');
    expect((await plan())!.entries[0]?.remarks).toBe('now');
    expect((await refusal(amend.execute({ id: STRANGER, role: 'FIELD' }, planId, [entry('2026-10-15', { remarks: 'z' })], ''))).statusCode).toBe(404);
  });
});

describe('A Daily Plan’s routes are its Tour Plan’s (decision-log 2026-11-19)', () => {
  let kit: ReturnType<typeof planningKit>;
  let submit: SubmitDailyPlanUseCase;

  beforeEach(async () => {
    const clock = new Clock(new Date('2026-09-20T04:00:00Z'));
    kit = planningKit(clock);
    kit.users.add(ASM, { level: 2 });
    kit.users.add(MR, { managerId: ASM });
    kit.routes.byUser.set(MR, [ROUTE, OTHER_ROUTE]);
    const saved = await new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views).execute(MR, MONTH, [entry('2026-10-15'), entry('2026-10-16', { workingType: 'MEETING', routeIds: [] })]);
    await new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter).execute(MR, saved.id);
    await kit.approvals.decide('MONTHLY_PLAN', saved.id, 'APPROVED');
    clock.set('2026-10-15T04:00:00Z');
    submit = new SubmitDailyPlanUseCase(kit.dailyPlans, kit.deadlines, kit.submitter, kit.approvals, kit.carryOver, kit.monthlyApproved, kit.scope, kit.monthlyPlans);
  });

  it('refuses to submit a day whose routes differ from the Tour Plan, and says to change the Tour Plan', async () => {
    const day = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))!;
    kit.dailyPlans.rows.set(day.id, { ...day, routeIds: [OTHER_ROUTE] });
    const err = await refusal(submit.execute(MR, day.id));
    expect(reasonOf(err)).toBe('PLAN_ROUTE_MISMATCH');
    expect(err.message).toContain('change the Tour Plan');
  });

  it('refuses to approve it too', async () => {
    const day = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))!;
    await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: day.id, submitterId: MR });
    kit.dailyPlans.rows.set(day.id, { ...day, routeIds: [OTHER_ROUTE] });
    expect(reasonOf(await refusal(kit.approvals.decide('DAILY_PLAN', day.id, 'APPROVED')))).toBe('PLAN_ROUTE_MISMATCH');
  });

  it('a day with the Tour Plan’s routes submits, and a meeting day (no routes) is not checked', async () => {
    const field = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-15'))!;
    expect((await submit.execute(MR, field.id)).status).toBe('SUBMITTED');
    const meeting = (await kit.dailyPlans.findByUserAndDate(MR, '2026-10-16'))!;
    kit.dailyPlans.rows.set(meeting.id, { ...meeting, workingType: 'MEETING', routeIds: [] });
    expect((await submit.execute(MR, meeting.id)).status).toBe('SUBMITTED');
  });
});
