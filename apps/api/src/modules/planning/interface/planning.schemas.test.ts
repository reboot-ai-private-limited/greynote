import { describe, expect, it } from 'vitest';
import {
  grantLateSubmitBodySchema,
  listDailyPlansQuerySchema,
  listMonthlyPlansQuerySchema,
  saveMonthlyPlanBodySchema,
} from './planning.schemas.js';

const ID = 'aaaaaaaaaaaaaaaaaaaaaaa1';

describe('planning schemas', () => {
  it('takes plan dates as calendar days, not instants or impossible days', () => {
    const entry = { workingType: 'MEETING' };
    const parse = (planDate: string) => saveMonthlyPlanBodySchema.safeParse({ planMonth: '2026-10', entries: [{ ...entry, planDate }] }).success;
    expect(parse('2026-10-05')).toBe(true);
    expect(parse('2026-10-05T00:00:00Z')).toBe(false);
    expect(parse('2026-02-30')).toBe(false);
  });

  it('turns blank remarks into null', () => {
    const parsed = saveMonthlyPlanBodySchema.parse({ planMonth: '2026-10', entries: [{ planDate: '2026-10-05', workingType: 'STRIKE', remarks: '  ' }] });
    expect(parsed.entries[0]!.remarks).toBeNull();
  });

  it('bounds list ranges', () => {
    expect(listDailyPlansQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-31' }).success).toBe(true);
    expect(listDailyPlansQuerySchema.safeParse({ from: '2026-10-31', to: '2026-10-01' }).success).toBe(false);
    expect(listDailyPlansQuerySchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(false);
    expect(listMonthlyPlansQuerySchema.safeParse({ from: '2026-01', to: '2026-12' }).success).toBe(true);
    expect(listMonthlyPlansQuerySchema.safeParse({ from: '2026-01', to: '2027-01' }).success).toBe(false);
  });

  it('caps a month at 31 entries', () => {
    const entries = Array.from({ length: 32 }, () => ({ planDate: '2026-10-01', workingType: 'MEETING' }));
    expect(saveMonthlyPlanBodySchema.safeParse({ planMonth: '2026-10', entries }).success).toBe(false);
  });

  it('requires a reason for a late-submission exception', () => {
    const body = { userId: ID, kind: 'DAILY_PLAN', planKey: '2026-10-05', reason: ' ' };
    expect(grantLateSubmitBodySchema.safeParse(body).success).toBe(false);
    expect(grantLateSubmitBodySchema.safeParse({ ...body, reason: 'Network down' }).success).toBe(true);
  });
});
