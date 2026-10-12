import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { PlanDay } from '../../domain/plan.js';
import { GrantLateSubmitUseCase } from './grantLateSubmit.usecase.js';
import { Clock, planningKit, SeedDailyPlan } from './planningTestKit.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';
import { SubmitDailyPlanUseCase } from './submitDailyPlan.usecase.js';
import { SubmitMonthlyPlanUseCase } from './submitMonthlyPlan.usecase.js';

const MR = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const DATE = '2026-10-05';
/** `HH:mm` IST on DATE as an instant (IST = UTC+05:30). */
const ist = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(2026, 9, 5, h, m) - 330 * 60_000);
};
const day: PlanDay = { workingType: 'FIELD_WORK', workWith: [], routeIds: [ROUTE], remarks: null };

async function expectLate(promise: Promise<unknown>) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe('PLAN_SUBMIT_LATE');
}

describe('Resubmit window after a rejection — Daily Plan', () => {
  let clock: Clock;
  let kit: ReturnType<typeof planningKit>;
  let save: SeedDailyPlan;
  let submit: SubmitDailyPlanUseCase;
  let planId: string;

  /** Submit, then the manager rejects at `hhmm` IST. */
  const rejectAt = async (hhmm: string) => {
    kit.approvals.setStatus('DAILY_PLAN', planId, 'REJECTED', ist(hhmm));
    clock.current = ist(hhmm);
  };

  beforeEach(async () => {
    clock = new Clock(ist('09:00'));
    kit = planningKit(clock);
    kit.users.add(MR);
    kit.routes.byUser.set(MR, [ROUTE]);
    save = new SeedDailyPlan(kit.dailyPlans, kit.views);
    submit = new SubmitDailyPlanUseCase(kit.dailyPlans, kit.deadlines, kit.submitter, kit.approvals, kit.carryOver, kit.monthlyApproved);
    planId = (await save.execute(MR, DATE, day)).id;
    await submit.execute(MR, planId);
  });

  it('gives 30 minutes after a late rejection', async () => {
    await rejectAt('10:20');
    clock.current = ist('10:50');
    expect((await kit.views.daily((await kit.dailyPlans.findById(planId))!)).resubmitAllowedUntil).toEqual(ist('10:50'));
    expect((await submit.execute(MR, planId)).status).toBe('SUBMITTED');
    expect((await kit.dailyPlans.findById(planId))?.lateResubmits).toBe(1);
  });

  it('closes 30 minutes after the rejection', async () => {
    await rejectAt('10:20');
    clock.current = ist('10:51');
    await expectLate(submit.execute(MR, planId));
  });

  it('extends a rejection just before the deadline past it', async () => {
    await rejectAt('09:50');
    clock.current = ist('10:15');
    expect((await submit.execute(MR, planId)).status).toBe('SUBMITTED');
  });

  it('never runs past 11:30', async () => {
    await rejectAt('11:15');
    clock.current = ist('11:31');
    await expectLate(submit.execute(MR, planId));
  });

  it('allows at most 2 window resubmits per plan', async () => {
    for (const at of ['10:20', '10:40']) {
      await rejectAt(at);
      await submit.execute(MR, planId);
    }
    await rejectAt('11:00');
    await expectLate(submit.execute(MR, planId));
  });

  it('doesn’t count an on-time resubmit against the limit', async () => {
    await rejectAt('09:10');
    await submit.execute(MR, planId);
    expect((await kit.dailyPlans.findById(planId))?.lateResubmits).toBe(0);
  });

  it('opens no window after the MR’s own withdraw', async () => {
    kit.approvals.setStatus('DAILY_PLAN', planId, 'WITHDRAWN', ist('09:59'));
    clock.current = ist('10:10');
    await expectLate(submit.execute(MR, planId));
  });

  it('uses the window before an exception, and the exception after the window', async () => {
    const grant = new GrantLateSubmitUseCase(kit.grants, kit.users, kit.config, clock.now);
    kit.users.add('aaaaaaaaaaaaaaaaaaaaaaa0', { role: 'ADMIN' });
    await rejectAt('10:20');
    const g = await grant.execute({ id: 'aaaaaaaaaaaaaaaaaaaaaaa0', role: 'ADMIN' }, { userId: MR, kind: 'DAILY_PLAN', planKey: DATE, reason: 'r' });
    await submit.execute(MR, planId);
    expect(kit.grants.rows.get(g.id)?.status).toBe('OPEN');

    await rejectAt('11:40'); // past 11:30 — no window
    await submit.execute(MR, planId);
    expect(kit.grants.rows.get(g.id)?.status).toBe('USED');
  });

  it('reads the limits from Config', async () => {
    kit.config.values['PLAN_RESUBMIT_GRACE_MAX'] = '0';
    await rejectAt('10:20');
    await expectLate(submit.execute(MR, planId));
    kit.config.values['PLAN_RESUBMIT_GRACE_MAX'] = '2';
    kit.config.values['DAILY_PLAN_RESUBMIT_GRACE_MINUTES'] = '5';
    clock.current = ist('10:26');
    await expectLate(submit.execute(MR, planId));
  });
});

describe('Resubmit window after a rejection — Monthly Plan', () => {
  it('gives 24 hours, but never past the start of the month', async () => {
    const clock = new Clock(new Date('2026-09-20T00:00:00Z'));
    const kit = planningKit(clock);
    kit.users.add(MR);
    kit.routes.byUser.set(MR, [ROUTE]);
    const save = new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views);
    const submit = new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter);
    const plan = await save.execute(MR, '2026-10', [{ planDate: '2026-10-05', ...day }]);
    await submit.execute(MR, plan.id);

    // Rejected 29 Sep 12:00 IST → until 30 Sep 12:00 IST.
    kit.approvals.setStatus('MONTHLY_PLAN', plan.id, 'REJECTED', new Date('2026-09-29T06:30:00Z'));
    clock.set('2026-09-30T06:30:00Z');
    expect((await submit.execute(MR, plan.id)).status).toBe('SUBMITTED');

    // Rejected 30 Sep 22:00 IST → the window stops at midnight, when October starts.
    kit.approvals.setStatus('MONTHLY_PLAN', plan.id, 'REJECTED', new Date('2026-09-30T16:30:00Z'));
    clock.set('2026-09-30T18:29:00Z');
    expect((await submit.execute(MR, plan.id)).status).toBe('SUBMITTED');
    kit.approvals.setStatus('MONTHLY_PLAN', plan.id, 'REJECTED', new Date('2026-09-30T18:00:00Z'));
    clock.set('2026-09-30T18:31:00Z');
    await expectLate(submit.execute(MR, plan.id));
  });
});
