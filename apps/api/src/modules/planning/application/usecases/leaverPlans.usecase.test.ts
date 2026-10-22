import { describe, expect, it } from 'vitest';
import type { PlanDay } from '../../domain/plan.js';
import { LeaverPlans } from '../leaverPlans.js';
import { Clock, planningKit } from './planningTestKit.js';

const MR = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const field: PlanDay = { workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: ['bbbbbbbbbbbbbbbbbbbbbbb1'], remarks: null };

describe('a leaver’s plans', () => {
  it('rejects the plans after the last working day still waiting; keeps earlier ones, drafts and the leaving month', async () => {
    const kit = planningKit(new Clock(new Date('2026-10-12T05:00:00Z')));
    const day = async (date: string, submit: boolean) => {
      const p = (await kit.dailyPlans.save(MR, date, field, null))!;
      if (submit) await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: p.id, submitterId: MR });
      return p.id;
    };
    const month = async (planMonth: string) => {
      const p = (await kit.monthlyPlans.save(MR, planMonth, [], null))!;
      await kit.approvals.submit({ kind: 'MONTHLY_PLAN', recordId: p.id, submitterId: MR });
      return p.id;
    };
    const before = await day('2026-10-10', true);
    const after = await day('2026-10-14', true);
    await day('2026-10-15', false); // a draft: left alone
    const leavingMonth = await month('2026-10');
    const nextMonth = await month('2026-11');

    const leaver = new LeaverPlans(kit.dailyPlans, kit.monthlyPlans, kit.approvals);
    expect(await leaver.count(MR, '2026-10-12')).toBe(2);
    expect(await leaver.close(MR, '2026-10-12')).toBe(2);
    const status = async (kind: string, id: string) => (await kit.approvals.getForRecord(kind, id))?.status;
    expect(await status('DAILY_PLAN', after)).toBe('REJECTED');
    expect(await status('MONTHLY_PLAN', nextMonth)).toBe('REJECTED');
    expect(await status('DAILY_PLAN', before)).toBe('SUBMITTED');
    expect(await status('MONTHLY_PLAN', leavingMonth)).toBe('SUBMITTED');
    expect(await leaver.close(MR, '2026-10-12')).toBe(0);
  });
});
