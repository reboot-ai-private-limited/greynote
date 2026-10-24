import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import { GetMonthlyPlanUseCase } from './getMonthlyPlan.usecase.js';
import { Clock, planningKit } from './planningTestKit.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';

const ADMIN = 'aaaaaaaaaaaaaaaaaaaaaaa0';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const MR = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const STRANGER = 'aaaaaaaaaaaaaaaaaaaaaaa4';
const ROUTE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const MONTH = '2026-10';

const entry = (planDate: string): MonthlyPlanEntry => ({ planDate, returnDate: null, workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: [ROUTE], remarks: null });

async function code(promise: Promise<unknown>) {
  const err = await promise.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).statusCode;
}

describe('One employee’s monthly plan, found by who and when', () => {
  let get: GetMonthlyPlanUseCase;

  beforeEach(async () => {
    const kit = planningKit(new Clock(new Date('2026-09-20T04:00:00Z')));
    kit.users.add(ADMIN, { role: 'ADMIN' });
    kit.users.add(ASM, { level: 2 });
    kit.users.add(MR, { managerId: ASM });
    kit.users.add(STRANGER);
    kit.routes.byUser.set(MR, [ROUTE]);
    await new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views).execute(MR, MONTH, [entry('2026-10-05')]);
    get = new GetMonthlyPlanUseCase(kit.monthlyPlans, kit.users, kit.views, kit.routes);
  });

  it('gives the plan, with its routes, to the employee, their manager and Admin', async () => {
    for (const actor of [{ id: MR, role: 'FIELD' as const }, { id: ASM, role: 'FIELD' as const }, { id: ADMIN, role: 'ADMIN' as const }]) {
      const plan = await get.forUserMonth(actor, MR, MONTH);
      expect(plan).toMatchObject({ userId: MR, planMonth: MONTH, status: 'DRAFT' });
      expect(plan.entries.map((e) => e.planDate)).toEqual(['2026-10-05']);
      expect(plan.routes.map((r) => r.id)).toEqual([ROUTE]);
    }
  });

  it('is a 404 for a month with no plan, and for someone who may not read it', async () => {
    expect(await code(get.forUserMonth({ id: ADMIN, role: 'ADMIN' }, MR, '2026-11'))).toBe(404);
    expect(await code(get.forUserMonth({ id: STRANGER, role: 'FIELD' }, MR, MONTH))).toBe(404);
  });
});
