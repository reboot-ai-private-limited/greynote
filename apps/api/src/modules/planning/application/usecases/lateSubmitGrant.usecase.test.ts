import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { PlanDay } from '../../domain/plan.js';
import { GrantLateSubmitUseCase } from './grantLateSubmit.usecase.js';
import { ListLateSubmitGrantsUseCase } from './listLateSubmitGrants.usecase.js';
import { Clock, planningKit } from './planningTestKit.js';
import { RevokeLateSubmitUseCase } from './revokeLateSubmit.usecase.js';
import { SaveDailyPlanUseCase } from './saveDailyPlan.usecase.js';
import { SubmitDailyPlanUseCase } from './submitDailyPlan.usecase.js';

const ADMIN = 'aaaaaaaaaaaaaaaaaaaaaaa0';
const MR = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const RSM = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const OTHER_ASM = 'aaaaaaaaaaaaaaaaaaaaaaa4';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const DATE = '2026-10-05';
const AFTER_CUTOFF = '2026-10-05T05:00:00Z'; // 10:30 IST

const admin = { id: ADMIN, role: 'ADMIN' as const };
const field = (id: string) => ({ id, role: 'FIELD' as const });
const day: PlanDay = { workingType: 'FIELD_WORK', workWith: [], routeIds: [ROUTE], remarks: null };
const grantInput = { userId: MR, kind: 'DAILY_PLAN' as const, planKey: DATE, reason: 'Network down at 9:45' };

async function expectError(promise: Promise<unknown>, statusCode: number, code?: string) {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).statusCode).toBe(statusCode);
  if (code) expect((err as AppError).code).toBe(code);
  return err as AppError;
}

describe('Late-submission exceptions', () => {
  let clock: Clock;
  let kit: ReturnType<typeof planningKit>;
  let save: SaveDailyPlanUseCase;
  let submit: SubmitDailyPlanUseCase;
  let grant: GrantLateSubmitUseCase;
  let revoke: RevokeLateSubmitUseCase;
  let list: ListLateSubmitGrantsUseCase;
  let planId: string;

  beforeEach(async () => {
    clock = new Clock(new Date('2026-10-05T03:00:00Z'));
    kit = planningKit(clock);
    kit.users.add(ADMIN, { role: 'ADMIN' });
    kit.users.add(RSM);
    kit.users.add(ASM, { managerId: RSM });
    kit.users.add(OTHER_ASM, { managerId: RSM });
    kit.users.add(MR, { managerId: ASM });
    kit.routes.byUser.set(MR, [ROUTE]);
    save = new SaveDailyPlanUseCase(kit.dailyPlans, kit.approvals, kit.views);
    submit = new SubmitDailyPlanUseCase(kit.dailyPlans, kit.deadlines, kit.submitter, kit.approvals, kit.carryOver);
    grant = new GrantLateSubmitUseCase(kit.grants, kit.users, kit.config, clock.now);
    revoke = new RevokeLateSubmitUseCase(kit.grants, clock.now);
    list = new ListLateSubmitGrantsUseCase(kit.grants, kit.users, clock.now);
    planId = (await save.execute(MR, DATE, day)).id;
    clock.set(AFTER_CUTOFF);
  });

  it('lets a late plan through once, then refuses the next late submit', async () => {
    const g = await grant.execute(admin, grantInput);
    expect((await submit.execute(MR, planId)).status).toBe('SUBMITTED');
    expect(kit.grants.rows.get(g.id)?.status).toBe('USED');

    // Rejected at 10:30 IST (on the test clock, like everything else), resubmitted at 12:00 IST: past the 30-minute
    // after-rejection window and its 11:30 cap, so only a fresh exception would let it through — and the one granted is spent.
    kit.approvals.setStatus('DAILY_PLAN', planId, 'REJECTED', new Date(AFTER_CUTOFF));
    clock.set('2026-10-05T06:30:00Z');
    await save.execute(MR, DATE, { ...day, remarks: 'fixed' });
    await expectError(submit.execute(MR, planId), 409, 'PLAN_SUBMIT_LATE');
  });

  it('shows on the plan until when a late submit is allowed', async () => {
    const g = await grant.execute(admin, grantInput);
    const view = await kit.views.daily((await kit.dailyPlans.findById(planId))!);
    expect(view.lateSubmitAllowedUntil).toEqual(g.expiresAt);
    expect(g.expiresAt.getTime() - clock.current.getTime()).toBe(24 * 3_600_000);
  });

  it('keeps the exception when the submit fails validation', async () => {
    const g = await grant.execute(admin, grantInput);
    kit.routes.byUser.set(MR, []);
    await expectError(submit.execute(MR, planId), 400);
    expect(kit.grants.rows.get(g.id)?.status).toBe('OPEN');
  });

  it('doesn’t use the exception on an on-time submit', async () => {
    clock.set('2026-10-05T03:00:00Z');
    const g = await grant.execute(admin, grantInput);
    await submit.execute(MR, planId);
    expect(kit.grants.rows.get(g.id)?.status).toBe('OPEN');
  });

  it('only lets a manager grant while the switch is on, and only for their team', async () => {
    await expectError(grant.execute(field(ASM), grantInput), 403);

    kit.config.values['LATE_PLAN_GRANT_BY_MANAGER'] = 'true';
    await expectError(grant.execute(field(OTHER_ASM), grantInput), 403);
    await expectError(grant.execute(field(MR), grantInput), 403); // not their own
    const g = await grant.execute(field(RSM), grantInput); // any depth above
    expect(g.grantedByRole).toBe('FIELD');
    expect((await submit.execute(MR, planId)).status).toBe('SUBMITTED');
  });

  it('refuses an expired exception, and allows a new one after it', async () => {
    await grant.execute(admin, grantInput);
    clock.set('2026-10-06T05:00:00Z'); // 24h later
    await expectError(submit.execute(MR, planId), 409, 'PLAN_SUBMIT_LATE');
    await grant.execute(admin, grantInput);
    expect((await submit.execute(MR, planId)).status).toBe('SUBMITTED');
  });

  it('allows one open exception per plan', async () => {
    await grant.execute(admin, grantInput);
    await expectError(grant.execute(admin, grantInput), 409, 'CONFLICT');
  });

  it('revokes an unused exception — Admin or the grantor only', async () => {
    kit.config.values['LATE_PLAN_GRANT_BY_MANAGER'] = 'true';
    const g = await grant.execute(field(ASM), grantInput);
    await expectError(revoke.execute(field(RSM), g.id), 403);
    expect((await revoke.execute(field(ASM), g.id)).status).toBe('REVOKED');
    await expectError(submit.execute(MR, planId), 409, 'PLAN_SUBMIT_LATE');
    await expectError(revoke.execute(admin, g.id), 409);
  });

  it('can’t revoke a used exception', async () => {
    const g = await grant.execute(admin, grantInput);
    await submit.execute(MR, planId);
    await expectError(revoke.execute(admin, g.id), 409);
  });

  it('checks the plan key against the kind, and that the employee is field staff', async () => {
    await expectError(grant.execute(admin, { ...grantInput, planKey: '2026-10' }), 400);
    await expectError(grant.execute(admin, { ...grantInput, kind: 'MONTHLY_PLAN' }), 400);
    await expectError(grant.execute(admin, { ...grantInput, userId: ADMIN }), 400);
    await expect(grant.execute(admin, { ...grantInput, kind: 'MONTHLY_PLAN', planKey: '2026-10' })).resolves.toMatchObject({
      status: 'OPEN',
    });
  });

  it('lists everyone’s for Admin, and self + team for field staff, with expiry applied', async () => {
    await grant.execute(admin, grantInput);
    await grant.execute(admin, { ...grantInput, userId: OTHER_ASM });
    expect((await list.execute(admin, {}, { page: 1, pageSize: 20 })).total).toBe(2);
    expect((await list.execute(field(ASM), {}, { page: 1, pageSize: 20 })).items.map((g) => g.userId)).toEqual([MR]);
    await expectError(list.execute(field(ASM), { userId: OTHER_ASM }, { page: 1, pageSize: 20 }), 403);

    clock.set('2026-10-07T00:00:00Z');
    const [first] = (await list.execute(field(MR), {}, { page: 1, pageSize: 20 })).items;
    expect(first?.status).toBe('EXPIRED');
  });
});
