import { describe, expect, it } from 'vitest';
import {
  grantLateSubmitBodySchema,
  listDailyPlansQuerySchema,
  listMonthlyPlansQuerySchema,
  saveDailyPlanBodySchema,
  saveMonthlyPlanBodySchema,
} from './planning.schemas.js';

const ID = 'aaaaaaaaaaaaaaaaaaaaaaa1';

describe('planning schemas', () => {
  it('takes plan dates as calendar days, not instants or impossible days', () => {
    const body = { planDate: '2026-10-05', workingType: 'MEETING' };
    expect(saveDailyPlanBodySchema.parse(body)).toEqual({ ...body, workWith: [], routeIds: [], remarks: null });
    expect(saveDailyPlanBodySchema.safeParse({ ...body, planDate: '2026-10-05T00:00:00Z' }).success).toBe(false);
    expect(saveDailyPlanBodySchema.safeParse({ ...body, planDate: '2026-02-30' }).success).toBe(false);
  });

  it('turns blank remarks into null', () => {
    expect(saveDailyPlanBodySchema.parse({ planDate: '2026-10-05', workingType: 'STRIKE', remarks: '  ' }).remarks).toBeNull();
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
