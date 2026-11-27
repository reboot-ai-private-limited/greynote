import { describe, expect, it } from 'vitest';
import type { PlanDay } from '../../domain/plan.js';
import { GetPlanStatusUseCase } from './getPlanStatus.usecase.js';
import { Clock, planningKit } from './planningTestKit.js';

const day = (o: Partial<PlanDay> = {}): PlanDay => ({ workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: ['r1'], remarks: null, ...o });

/**
 * Guard (2026-11-27): calendars and reports read many plans' approvals in one batched query. If a change brings back one lookup per
 * plan, these fail — production talks to the database over the network, so that is what made the pages slow.
 */
describe('plan statuses are read in a batch, never one per plan', () => {
  it('days() and daysForUsers() make no per-plan approval lookups, and give the same answers', async () => {
    const kit = planningKit(new Clock(new Date('2026-10-20T04:00:00Z')));
    for (const userId of ['u1', 'u2']) for (let d = 1; d <= 10; d += 1) await kit.dailyPlans.createInherited(userId, `2026-10-${String(d).padStart(2, '0')}`, day());
    const plan = (await kit.dailyPlans.findByUserAndDate('u1', '2026-10-03'))!;
    await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: plan.id, submitterId: 'u1' });

    let single = 0;
    let batched = 0;
    const realGet = kit.approvals.getForRecord.bind(kit.approvals);
    const realList = kit.approvals.listForRecords.bind(kit.approvals);
    kit.approvals.getForRecord = async (kind, id) => ((single += 1), realGet(kind, id));
    kit.approvals.listForRecords = async (kind, ids) => ((batched += 1), realList(kind, ids));

    const status = new GetPlanStatusUseCase(kit.dailyPlans, kit.monthlyPlans, kit.approvals);
    const one = await status.days('u1', '2026-10-01', '2026-10-31');
    const many = await status.daysForUsers(['u1', 'u2'], '2026-10-01', '2026-10-31');
    expect(single).toBe(0);
    expect(batched).toBe(2);
    expect(one).toHaveLength(10);
    expect(one.find((d) => d.date === '2026-10-03')?.status).toBe('SUBMITTED');
    expect(many.find((m) => m.userId === 'u1')?.days).toEqual(one);
    expect(many.find((m) => m.userId === 'u2')?.days).toHaveLength(10);
  });
});
