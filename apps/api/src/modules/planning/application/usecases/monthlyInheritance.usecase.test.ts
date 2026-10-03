import { beforeEach, describe, expect, it } from 'vitest';
import type { AppError } from '@/shared/errors/AppError.js';
import type { PlanDay } from '../../domain/plan.js';
import { BackfillInheritedDaysUseCase } from './backfillInheritedDays.usecase.js';
import { Clock, inlineTransactions, planningKit } from './planningTestKit.js';
import { SaveDailyPlanUseCase } from './saveDailyPlan.usecase.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';
import { SubmitDailyPlanUseCase } from './submitDailyPlan.usecase.js';
import { SubmitMonthlyPlanUseCase } from './submitMonthlyPlan.usecase.js';

const MR = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const NSM = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const STRANGER = 'aaaaaaaaaaaaaaaaaaaaaaa4';
const ADMIN = 'aaaaaaaaaaaaaaaaaaaaaaa5';
const R1 = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const R2 = 'bbbbbbbbbbbbbbbbbbbbbbb2';

const field = (routeId: string): PlanDay => ({ workingType: 'FIELD_WORK', workWith: [], routeIds: [routeId], remarks: null });
const reason = (p: Promise<unknown>) => p.then(() => undefined, (e: AppError) => (e.publicDetails as { reason?: string } | undefined)?.reason);

describe('Daily Plans inherited from the Monthly Plan', () => {
  let kit: ReturnType<typeof planningKit>;
  let saveDaily: SaveDailyPlanUseCase;
  let submitDaily: SubmitDailyPlanUseCase;
  let monthlyId: string;
  let clock: Clock;

  beforeEach(async () => {
    // The month is submitted before its cutoff (28 Sept); the rest of the test runs on 3 Oct.
    clock = new Clock(new Date('2026-09-20T05:00:00Z'));
    kit = planningKit(clock);
    kit.users.add(NSM);
    kit.users.add(ASM, { managerId: NSM });
    kit.users.add(MR, { managerId: ASM });
    kit.users.add(STRANGER);
    kit.users.add(ADMIN, { role: 'ADMIN' });
    kit.routes.byUser.set(MR, [R1, R2]);
    saveDaily = new SaveDailyPlanUseCase(kit.dailyPlans, kit.approvals, kit.views);
    submitDaily = new SubmitDailyPlanUseCase(kit.dailyPlans, kit.deadlines, kit.submitter);
    const saveMonthly = new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views);
    const submitMonthly = new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter);
    const plan = await saveMonthly.execute(MR, '2026-10', [
      { planDate: '2026-10-02', ...field(R1) }, // already past
      { planDate: '2026-10-06', ...field(R1) },
      { planDate: '2026-10-07', ...field(R2) },
    ]);
    monthlyId = plan.id;
    await submitMonthly.execute(MR, plan.id);
    clock.set('2026-10-03T05:00:00Z');
  });

  const daily = (date: string) => kit.dailyPlans.findByUserAndDate(MR, date);

  it('submitting the month writes nothing; approving it writes each coming day as a draft the employee did not author', async () => {
    expect(await daily('2026-10-06')).toBeNull();
    await kit.approvals.decide('MONTHLY_PLAN', monthlyId, 'MANAGER_APPROVED');
    expect(await daily('2026-10-06')).toMatchObject({ source: 'MONTHLY', routeIds: [R1], revision: 1 });
    expect(await daily('2026-10-07')).toMatchObject({ source: 'MONTHLY', routeIds: [R2] });
    expect(await daily('2026-10-02')).toBeNull(); // past days are skipped
    // Inheriting is not approving: there is no request for the day yet.
    expect(await kit.approvals.getForRecord('DAILY_PLAN', (await daily('2026-10-06'))!.id)).toBeNull();
  });

  it('the second approval stage (and any repeat) changes nothing', async () => {
    await kit.approvals.decide('MONTHLY_PLAN', monthlyId, 'MANAGER_APPROVED');
    await kit.approvals.decide('MONTHLY_PLAN', monthlyId, 'APPROVED');
    expect(kit.dailyPlans.rows.size).toBe(2);
    expect(await daily('2026-10-06')).toMatchObject({ revision: 1 });
  });

  it('the employee can’t edit an inherited day but can submit it as it is', async () => {
    await kit.approvals.decide('MONTHLY_PLAN', monthlyId, 'APPROVED');
    expect(await reason(saveDaily.execute(MR, '2026-10-06', field(R2)))).toBe('PLAN_INHERITED_READONLY');
    const request = await submitDaily.execute(MR, (await daily('2026-10-06'))!.id);
    expect(request.status).toBe('SUBMITTED');
  });

  it('a day the monthly plan did not cover is still the employee’s to write', async () => {
    await kit.approvals.decide('MONTHLY_PLAN', monthlyId, 'APPROVED');
    const plan = await saveDaily.execute(MR, '2026-10-08', field(R1));
    expect(plan.source).toBe('MANUAL');
  });

  it('the backfill gives a month approved before inheritance its days: a dry run counts, apply writes, a repeat adds nothing', async () => {
    kit.approvals.setStatus('MONTHLY_PLAN', monthlyId, 'APPROVED'); // approved without the hook, as before this change
    const backfill = new BackfillInheritedDaysUseCase(kit.monthlyPlans, kit.dailyPlans, kit.approvals, kit.deadlines, inlineTransactions);
    expect(await backfill.execute(false)).toEqual({ approvedMonthlyPlans: 1, dailyPlansWritten: 0 });
    expect(kit.dailyPlans.rows.size).toBe(0);
    expect(await backfill.execute(true)).toEqual({ approvedMonthlyPlans: 1, dailyPlansWritten: 2 });
    expect(await backfill.execute(true)).toEqual({ approvedMonthlyPlans: 1, dailyPlansWritten: 0 });
  });

  describe('amend', () => {
    beforeEach(async () => {
      await kit.approvals.decide('MONTHLY_PLAN', monthlyId, 'APPROVED');
    });
    const amend = async (actor: string, role: 'FIELD' | 'ADMIN' = 'FIELD', date = '2026-10-06', day = field(R2)) =>
      kit.amend.execute({ id: actor, role }, (await daily(date))!.id, day, 'Customer visit moved');

    it('the manager, a manager above them, and Admin may; the body changes and the old one is kept', async () => {
      for (const [actor, role] of [[ASM, 'FIELD'], [NSM, 'FIELD'], [ADMIN, 'ADMIN']] as const) {
        const before = (await daily('2026-10-06'))!;
        const after = await amend(actor, role, '2026-10-06', field(before.routeIds[0] === R1 ? R2 : R1));
        expect(after.revision).toBe(before.revision + 1);
        expect(after.amendments.at(-1)).toMatchObject({ by: actor, reason: 'Customer visit moved', previous: { routeIds: before.routeIds } });
      }
    });

    it('not the employee, and not someone outside their chain', async () => {
      await expect(amend(MR)).rejects.toMatchObject({ statusCode: 403 });
      await expect(amend(STRANGER)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('validates the new day against the employee’s own routes', async () => {
      await expect(amend(ASM, 'FIELD', '2026-10-06', field('bbbbbbbbbbbbbbbbbbbbbbb9'))).rejects.toMatchObject({ statusCode: 400 });
    });

    it('leaves an already approved day approved, so the DCR gate stays open', async () => {
      const plan = (await daily('2026-10-06'))!;
      await submitDaily.execute(MR, plan.id);
      kit.approvals.setStatus('DAILY_PLAN', plan.id, 'APPROVED');
      await amend(ASM);
      expect((await kit.approvals.getForRecord('DAILY_PLAN', plan.id))?.status).toBe('APPROVED');
    });

    it('is refused once that day’s DCR is submitted, and for a day that is over', async () => {
      kit.reported.add(`${MR}:2026-10-06`);
      expect(await reason(amend(ASM))).toBe('PLAN_DAY_REPORTED');
      await kit.dailyPlans.save(MR, '2026-10-02', field(R1), null);
      await expect(kit.amend.execute({ id: ASM, role: 'FIELD' }, (await daily('2026-10-02'))!.id, field(R2), 'late')).rejects.toMatchObject({ statusCode: 409 });
    });

    it('a monthly re-approval does not overwrite an amended day', async () => {
      await amend(ASM);
      await kit.approvals.decide('MONTHLY_PLAN', monthlyId, 'APPROVED');
      expect(await daily('2026-10-06')).toMatchObject({ routeIds: [R2] });
    });
  });
});
