import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { PlanDay } from '../../domain/plan.js';
import { Clock, planningKit } from './planningTestKit.js';
import { SaveDailyPlanUseCase } from './saveDailyPlan.usecase.js';
import { SubmitDailyPlanUseCase } from './submitDailyPlan.usecase.js';

const MR = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const OTHER = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const R1 = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const R2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const R3 = 'bbbbbbbbbbbbbbbbbbbbbbb3';
const DATE = '2026-10-05';
// 10:00 IST on DATE is 04:30Z; the change is asked at 09:00 IST, after the plan was approved.
const MORNING = '2026-10-05T03:30:00Z';
const BEFORE_CUTOFF = '2026-10-05T04:00:00Z';

const fieldDay = (over: Partial<PlanDay> = {}): PlanDay => ({ workingType: 'FIELD_WORK', workWith: [], routeIds: [R1], remarks: null, ...over });

async function expectError(promise: Promise<unknown>, statusCode: number) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
  return err as AppError;
}

describe('In-day change to an approved Daily Plan', () => {
  let clock: Clock;
  let kit: ReturnType<typeof planningKit>;
  let planId: string;

  /** The plan for DATE, saved, submitted and approved (`status` MANAGER_APPROVED or APPROVED). */
  async function approvedPlan(status: 'MANAGER_APPROVED' | 'APPROVED' = 'APPROVED') {
    const saved = await new SaveDailyPlanUseCase(kit.dailyPlans, kit.approvals, kit.views).execute(MR, DATE, fieldDay());
    await new SubmitDailyPlanUseCase(kit.dailyPlans, kit.deadlines, kit.submitter).execute(MR, saved.id);
    kit.approvals.setStatus('DAILY_PLAN', saved.id, status);
    return saved.id;
  }
  const ask = (day: PlanDay = fieldDay({ routeIds: [R2] }), reason = 'Doctor is out today', user = MR) => kit.requestChange.execute(user, planId, day, reason);
  const decide = (changeId: string, status: 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'REOPENED') => kit.approvals.decide('DAILY_PLAN_CHANGE', changeId, status);

  beforeEach(async () => {
    clock = new Clock(new Date(BEFORE_CUTOFF));
    kit = planningKit(clock);
    kit.users.add(ASM);
    kit.users.add(MR, { managerId: ASM });
    kit.users.add(OTHER);
    kit.routes.byUser.set(MR, [R1, R2, R3]);
    planId = await approvedPlan();
    clock.set(MORNING);
  });

  it('is its own request to the manager: the plan stays approved and unchanged while it waits', async () => {
    const change = await ask();
    expect(change).toMatchObject({ planId, userId: MR, planDate: DATE, open: true, applied: false, reason: 'Doctor is out today' });
    expect(change.previous.routeIds).toEqual([R1]);
    expect(change.proposed.routeIds).toEqual([R2]);
    expect(kit.approvals.requests.get(`DAILY_PLAN_CHANGE:${change.id}`)?.status).toBe('SUBMITTED');
    expect(kit.approvals.definitions.get('DAILY_PLAN_CHANGE')?.managerOnly).toBe(true);
    expect((await kit.dailyPlans.findById(planId))!.routeIds).toEqual([R1]);
    expect(kit.approvals.requests.get(`DAILY_PLAN:${planId}`)?.status).toBe('APPROVED');
  });

  it('works while the plan is only manager-approved too — the day’s gate is open then', async () => {
    kit.approvals.setStatus('DAILY_PLAN', planId, 'MANAGER_APPROVED');
    expect((await ask()).open).toBe(true);
  });

  it('approving it writes the change into the plan and bumps its revision', async () => {
    const before = (await kit.dailyPlans.findById(planId))!;
    const change = await ask(fieldDay({ routeIds: [R2, R3], remarks: 'switched' }));
    await decide(change.id, 'APPROVED');
    const after = (await kit.dailyPlans.findById(planId))!;
    expect(after).toMatchObject({ routeIds: [R2, R3], remarks: 'switched', revision: before.revision + 1 });
    expect(kit.changes.rows[0]).toMatchObject({ open: false, applied: true });
    expect(kit.approvals.requests.get(`DAILY_PLAN:${planId}`)?.status).toBe('APPROVED'); // the plan's own approval is untouched
  });

  it('rejecting or withdrawing leaves the plan alone and frees the plan for another request', async () => {
    const first = await ask();
    await decide(first.id, 'REJECTED');
    expect((await kit.dailyPlans.findById(planId))!.routeIds).toEqual([R1]);
    expect(kit.changes.rows[0]).toMatchObject({ open: false, applied: false });
    const second = await ask(fieldDay({ routeIds: [R3] }));
    await decide(second.id, 'WITHDRAWN');
    expect((await kit.dailyPlans.findById(planId))!.routeIds).toEqual([R1]);
    expect((await ask(fieldDay({ routeIds: [R2] }))).open).toBe(true);
  });

  it('one waiting change per plan, even for requests made at the same time', async () => {
    const [a, b] = await Promise.allSettled([ask(), ask(fieldDay({ routeIds: [R3] }))]);
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = (a.status === 'rejected' ? a : (b as PromiseRejectedResult)).reason as AppError;
    expect(rejected.statusCode).toBe(409);
    expect(kit.changes.rows).toHaveLength(1);
    await expectError(ask(), 409);
  });

  it('only today’s plan, and only an approved one', async () => {
    clock.set('2026-10-04T05:00:00Z'); // the day before
    await expectError(ask(), 409);
    clock.set('2026-10-06T05:00:00Z'); // the day after
    await expectError(ask(), 409);
    clock.set(MORNING);

    kit.approvals.setStatus('DAILY_PLAN', planId, 'SUBMITTED');
    expect((await expectError(ask(), 409)).message).toContain('waiting');
    kit.approvals.setStatus('DAILY_PLAN', planId, 'REJECTED');
    expect((await expectError(ask(), 409)).message).toContain('isn’t approved');
  });

  it('a draft plan is an ordinary edit, not a change', async () => {
    const draft = await new SaveDailyPlanUseCase(kit.dailyPlans, kit.approvals, kit.views).execute(OTHER, DATE, { ...fieldDay(), routeIds: [] , workingType: 'MEETING' });
    await expectError(kit.requestChange.execute(OTHER, draft.id, fieldDay({ workingType: 'MEETING', routeIds: [] , remarks: 'x' }), 'why'), 409);
  });

  it('only the owner can ask; a blocked employee cannot', async () => {
    await expectError(ask(fieldDay({ routeIds: [R2] }), 'why', OTHER), 404);
    kit.users.users.get(MR)!.isBlocked = true;
    await expectError(ask(), 403);
  });

  it('is validated like a submit — own routes, real colleagues, a sensible day — and must actually change something', async () => {
    await expectError(ask(fieldDay({ routeIds: ['bbbbbbbbbbbbbbbbbbbbbbb9'] })), 400); // not the employee's route
    await expectError(ask(fieldDay({ workWith: [MR] })), 400); // with themselves
    await expectError(ask(fieldDay({ workWith: ['aaaaaaaaaaaaaaaaaaaaaa99'] })), 400); // nobody
    await expectError(ask(fieldDay({ workingType: 'MEETING' })), 400); // a meeting with routes
    await expectError(ask(fieldDay({ routeIds: [R1] })), 400); // identical to the plan
    expect(kit.changes.rows).toHaveLength(0);
  });

  it('the deadline does not apply — it is after it by nature', async () => {
    clock.set('2026-10-05T09:00:00Z'); // 14:30 IST, well past the 10:00 cutoff
    expect((await ask()).open).toBe(true);
  });

  it('at most DAILY_PLAN_CHANGE_MAX applied changes per plan', async () => {
    kit.config.values.DAILY_PLAN_CHANGE_MAX = '2';
    for (const route of [R2, R3]) {
      const c = await ask(fieldDay({ routeIds: [route] }));
      await decide(c.id, 'APPROVED');
    }
    expect((await expectError(ask(fieldDay({ routeIds: [R1] })), 409)).message).toContain('most allowed');
    // rejected ones don't count
    kit.config.values.DAILY_PLAN_CHANGE_MAX = '3';
    const c = await ask(fieldDay({ routeIds: [R1] }));
    await decide(c.id, 'REJECTED');
    expect(kit.changes.rows.filter((x) => x.applied)).toHaveLength(2);
  });

  describe('what stops an approval from being applied (the decision rolls back)', () => {
    it('the plan was reopened and is no longer approved', async () => {
      const change = await ask();
      kit.approvals.setStatus('DAILY_PLAN', planId, 'REOPENED');
      await expectError(decide(change.id, 'APPROVED'), 409);
      expect(kit.approvals.requests.get(`DAILY_PLAN_CHANGE:${change.id}`)?.status).toBe('SUBMITTED');
      expect(kit.changes.rows[0]!.open).toBe(true);
    });

    it('the plan moved on after the request (it was edited, so its revision changed)', async () => {
      const change = await ask();
      kit.dailyPlans.rows.set(planId, { ...(await kit.dailyPlans.findById(planId))!, revision: 99 });
      await expectError(decide(change.id, 'APPROVED'), 409);
      expect((await kit.dailyPlans.findById(planId))!.routeIds).toEqual([R1]);
    });

    it('the day is over by the time the manager gets to it', async () => {
      const change = await ask();
      clock.set('2026-10-06T05:00:00Z');
      await expectError(decide(change.id, 'APPROVED'), 409);
      expect((await kit.dailyPlans.findById(planId))!.routeIds).toEqual([R1]);
      await decide(change.id, 'REJECTED'); // but it can still be closed
      expect(kit.changes.rows[0]!.open).toBe(false);
    });

    it('a decided change cannot be reopened', async () => {
      const change = await ask();
      await decide(change.id, 'APPROVED');
      await expectError(decide(change.id, 'REOPENED'), 409);
    });
  });

  it('lists a plan’s changes newest first with their status — owner, manager, Admin; nobody else', async () => {
    const a = await ask();
    await decide(a.id, 'REJECTED');
    const b = await ask(fieldDay({ routeIds: [R3] }));
    kit.users.add('admin', { role: 'ADMIN' });
    const mine = await kit.listChanges.execute({ id: MR, role: 'FIELD' }, planId);
    expect(mine.map((c) => [c.id, c.status])).toEqual([[b.id, 'SUBMITTED'], [a.id, 'REJECTED']]);
    expect((await kit.listChanges.execute({ id: ASM, role: 'FIELD' }, planId)).length).toBe(2);
    expect((await kit.listChanges.execute({ id: 'admin', role: 'ADMIN' }, planId)).length).toBe(2);
    await expectError(kit.listChanges.execute({ id: OTHER, role: 'FIELD' }, planId), 403);
    await expectError(kit.listChanges.execute({ id: MR, role: 'FIELD' }, 'nope'), 404);
  });
});
