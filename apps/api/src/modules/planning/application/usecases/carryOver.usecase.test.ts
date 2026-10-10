import { beforeEach, describe, expect, it } from 'vitest';
import { Clock, planningKit } from './planningTestKit.js';

const MR = 'mr-1';
const ROUTE = 'route-1';

describe('doctor list and carry-over', () => {
  let kit: ReturnType<typeof planningKit>;

  /** An approved field-work plan on `date` listing `doctorIds`. */
  const approvedDay = async (date: string, doctorIds: string[]) => {
    const plan = await kit.dailyPlans.save(MR, date, { workingType: 'FIELD_WORK', workWith: [], routeIds: [ROUTE], remarks: null }, null);
    await kit.setDoctors.execute(MR, date, doctorIds);
    await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: plan!.id, submitterId: MR });
    kit.approvals.setStatus('DAILY_PLAN', plan!.id, 'APPROVED');
  };

  beforeEach(() => {
    kit = planningKit(new Clock(new Date('2026-10-12T04:00:00Z')));
    kit.doctors.set(MR, ['d1', 'd2', 'd3', 'd4', 'd5'].map((id) => ({ id, routeId: ROUTE })));
  });

  it('carries uncalled doctors to the next day, tagged with the day they were planned', async () => {
    await approvedDay('2026-10-05', ['d1', 'd2', 'd3', 'd4', 'd5']);
    kit.calls.push({ userId: MR, doctorId: 'd1', date: '2026-10-05' }, { userId: MR, doctorId: 'd2', date: '2026-10-05' }, { userId: MR, doctorId: 'd3', date: '2026-10-05' });
    expect(await kit.carryOver.pending(MR, '2026-10-06')).toEqual([
      { doctorId: 'd4', carriedFrom: '2026-10-05' },
      { doctorId: 'd5', carriedFrom: '2026-10-05' },
    ]);
  });

  it('keeps the original day when a carried doctor is missed again, and drops them once called', async () => {
    await approvedDay('2026-10-05', ['d4']);
    await approvedDay('2026-10-06', []);
    expect(await kit.carryOver.pending(MR, '2026-10-07')).toEqual([{ doctorId: 'd4', carriedFrom: '2026-10-05' }]);
    kit.calls.push({ userId: MR, doctorId: 'd4', date: '2026-10-06' });
    expect(await kit.carryOver.pending(MR, '2026-10-07')).toEqual([]);
  });

  it('adds owed doctors to the list and refuses doctors off the day’s routes', async () => {
    await approvedDay('2026-10-05', ['d4']);
    await kit.dailyPlans.save(MR, '2026-10-06', { workingType: 'FIELD_WORK', workWith: [], routeIds: [ROUTE], remarks: null }, null);
    const plan = await kit.setDoctors.execute(MR, '2026-10-06', ['d1']);
    expect(plan.doctors).toEqual([{ doctorId: 'd4', carriedFrom: '2026-10-05' }, { doctorId: 'd1', carriedFrom: null }]);
    kit.doctors.set(MR, [{ id: 'd9', routeId: 'other-route' }]);
    await expect(kit.setDoctors.execute(MR, '2026-10-06', ['d9'])).rejects.toThrow();
  });

  it('stops carrying at month end by default, after N days when set, and never when forever', async () => {
    await approvedDay('2026-09-29', ['d1']);
    expect(await kit.carryOver.pending(MR, '2026-10-01')).toEqual([]);
    kit.config.values.CALL_CARRY_OVER_DAYS = '5';
    expect(await kit.carryOver.pending(MR, '2026-10-03')).toEqual([{ doctorId: 'd1', carriedFrom: '2026-09-29' }]);
    expect(await kit.carryOver.pending(MR, '2026-10-05')).toEqual([]);
    kit.config.values.CALL_CARRY_OVER_FOREVER = 'true';
    expect(await kit.carryOver.pending(MR, '2026-10-20')).toEqual([{ doctorId: 'd1', carriedFrom: '2026-09-29' }]);
  });
});
