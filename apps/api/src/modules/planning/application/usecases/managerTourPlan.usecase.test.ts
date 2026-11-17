import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import { Clock, planningKit } from './planningTestKit.js';
import { SaveMonthlyPlanUseCase } from './saveMonthlyPlan.usecase.js';
import { SubmitMonthlyPlanUseCase } from './submitMonthlyPlan.usecase.js';

// ZSM → RSM → ASM → MR: routes belong to MRs, and a manager's Tour Plan names the routes held by anyone below them.
const ZSM = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const RSM = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const ASM = 'aaaaaaaaaaaaaaaaaaaaaaa3';
const MR = 'aaaaaaaaaaaaaaaaaaaaaaa4';
const OTHER_MR = 'aaaaaaaaaaaaaaaaaaaaaaa5';
const R_MR = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const R_OTHER = 'bbbbbbbbbbbbbbbbbbbbbbb2';
const R_NOBODY = 'bbbbbbbbbbbbbbbbbbbbbbb3';
const MONTH = '2026-10';

const entry = (routeIds: string[], over: Partial<MonthlyPlanEntry> = {}): MonthlyPlanEntry => ({
  planDate: '2026-10-05', returnDate: null, workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds, remarks: null, ...over,
});

async function status(p: Promise<unknown>): Promise<number | 'ok'> {
  return p.then(() => 'ok' as const, (e: unknown) => (e instanceof AppError ? e.statusCode : 500));
}

describe('a manager’s Tour Plan: the routes held by anyone below them', () => {
  let kit: ReturnType<typeof planningKit>;
  let save: SaveMonthlyPlanUseCase;
  let submit: SubmitMonthlyPlanUseCase;

  const plan = async (userId: string, routeIds: string[]) => {
    const saved = await save.execute(userId, MONTH, [entry(routeIds)]);
    return submit.execute(userId, saved.id);
  };

  beforeEach(() => {
    kit = planningKit(new Clock(new Date('2026-09-20T04:00:00Z')));
    kit.users.add(ZSM, { level: 4 });
    kit.users.add(RSM, { level: 3, managerId: ZSM });
    kit.users.add(ASM, { level: 2, managerId: RSM });
    kit.users.add(MR, { level: 1, managerId: ASM });
    kit.users.add(OTHER_MR, { level: 1 }); // not in this chain
    kit.routes.byUser.set(MR, [R_MR]);
    kit.routes.byUser.set(OTHER_MR, [R_OTHER]);
    save = new SaveMonthlyPlanUseCase(kit.monthlyPlans, kit.approvals, kit.views);
    submit = new SubmitMonthlyPlanUseCase(kit.monthlyPlans, kit.deadlines, kit.submitter);
  });

  it('an ASM, RSM and ZSM can each plan a route held by the MR below them, at any depth, holding none themselves', async () => {
    for (const manager of [ASM, RSM, ZSM]) expect(await status(plan(manager, [R_MR]))).toBe('ok');
  });

  it('a manager cannot plan a route nobody below them holds, or one held by someone outside their line', async () => {
    expect(await status(plan(RSM, [R_NOBODY]))).toBe(400);
    expect(await status(plan(RSM, [R_OTHER]))).toBe(400);
  });

  it('an MR still plans only their own routes', async () => {
    expect(await status(plan(MR, [R_MR]))).toBe('ok');
    expect(await status(plan(OTHER_MR, [R_MR]))).toBe(400);
  });

  it('a route that leaves the team leaves the manager’s allowed routes at once, nothing is copied', async () => {
    kit.routes.byUser.set(MR, []); // the MR gave the route up
    expect(await status(plan(ASM, [R_MR]))).toBe(400);
  });

  it('works with is dropped from a Tour Plan day', async () => {
    const saved = await save.execute(ASM, MONTH, [entry([R_MR], { workWith: [MR] })]);
    expect(saved.entries[0]?.workWith).toEqual([]);
  });
});
