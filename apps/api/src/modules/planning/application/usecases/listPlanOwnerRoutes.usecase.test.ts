import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { ListPlanOwnerRoutesUseCase } from './listPlanOwnerRoutes.usecase.js';
import { Clock, planningKit } from './planningTestKit.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';

const ADMIN = 'aaaaaaaaaaaaaaaaaaaaaaa0';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const MR = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const STRANGER = 'aaaaaaaaaaaaaaaaaaaaaaa4';
const B = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const A = 'bbbbbbbbbbbbbbbbbbbbbbb1';

describe('The routes of a plan’s owner', () => {
  let kit: ReturnType<typeof planningKit>;
  let list: ListPlanOwnerRoutesUseCase;
  let planId: string;

  beforeEach(async () => {
    kit = planningKit(new Clock(new Date('2026-09-20T04:00:00Z')));
    kit.users.add(ADMIN, { role: 'ADMIN' });
    kit.users.add(ASM, { level: 2 });
    kit.users.add(MR, { managerId: ASM });
    kit.users.add(STRANGER);
    kit.routes.byUser.set(MR, [B, A]);
    kit.routes.types.set(B, 'OUT_STATION');
    list = new ListPlanOwnerRoutesUseCase(kit.monthlyPlans, kit.users, kit.routes);
    planId = (await new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views).execute(MR, '2026-10', [])).id;
  });

  it('lists them by name with their type, for the owner, a manager above and Admin', async () => {
    for (const actor of [{ id: ASM, role: 'FIELD' as const }, { id: MR, role: 'FIELD' as const }, { id: ADMIN, role: 'ADMIN' as const }]) {
      expect(await list.execute(actor, planId)).toEqual([
        { id: A, name: `Route ${A}`, routeType: 'HQ' },
        { id: B, name: `Route ${B}`, routeType: 'OUT_STATION' },
      ]);
    }
  });

  it('is not open to others, and not for an unknown plan', async () => {
    await expect(list.execute({ id: STRANGER, role: 'FIELD' }, planId)).rejects.toMatchObject({ statusCode: 403 });
    await expect(list.execute({ id: ASM, role: 'FIELD' }, 'missing')).rejects.toBeInstanceOf(AppError);
  });
});
