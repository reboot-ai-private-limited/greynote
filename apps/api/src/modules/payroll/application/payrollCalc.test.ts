import { describe, expect, it } from 'vitest';
import { MAX_PAISE } from '@/shared/money/paise.js';
import { absentDeductionPaise, adjustmentEffects, chargeableAbsentDays, dayAdjustmentPaise, leaveDeductionPaise, netPayablePaise, payDaysOf } from './payrollCalc.js';

describe('leaveDeductionPaise — unpaid days × base ÷ 30, half up to a paise once', () => {
  it('no unpaid leave deducts nothing', () => {
    expect(leaveDeductionPaise(0, 3_000_000)).toBe(0);
  });

  it('is exact when 30 divides the salary', () => {
    expect(leaveDeductionPaise(1, 3_000_000)).toBe(100_000);
    expect(leaveDeductionPaise(2.5, 3_000_000)).toBe(250_000);
    expect(leaveDeductionPaise(30, 3_000_000)).toBe(3_000_000);
  });

  it('a half-day is half a day’s pay', () => {
    expect(leaveDeductionPaise(0.5, 3_000_000)).toBe(50_000);
  });

  it('rounds half up, at the paise', () => {
    expect(leaveDeductionPaise(1, 2_500_050)).toBe(83_335); // 83,335.0 exactly
    expect(leaveDeductionPaise(1, 2_500_049)).toBe(83_335); // 83,334.97 → up
    expect(leaveDeductionPaise(1, 2_500_040)).toBe(83_335); // 83,334.67 → up
    expect(leaveDeductionPaise(1, 2_500_030)).toBe(83_334); // 83,334.33 → down
    expect(leaveDeductionPaise(0.5, 31)).toBe(1); // 0.5167 → up
    expect(leaveDeductionPaise(0.5, 29)).toBe(0); // 0.483 → down
    expect(leaveDeductionPaise(0.5, 30)).toBe(1); // exactly 0.5 → up
  });

  it('a 31-day month with every day unpaid never deducts more than the base', () => {
    expect(leaveDeductionPaise(31, 3_000_000)).toBe(3_000_000);
  });

  it('refuses a value that is not whole or half days, or is negative', () => {
    for (const bad of [0.3, 1.25, -1, NaN, Infinity]) expect(() => leaveDeductionPaise(bad, 3_000_000)).toThrow(RangeError);
  });
});

describe('netPayablePaise', () => {
  it('is base + TA/DA + reimbursement − deduction', () => {
    expect(netPayablePaise({ baseSalaryPaise: 3_000_000, totalTaDaPaise: 28_003, reimbursementPaise: 5_000, leaveDeductionPaise: 100_000 })).toBe(2_933_003);
    expect(netPayablePaise({ baseSalaryPaise: 3_000_000, totalTaDaPaise: 0, reimbursementPaise: 0, leaveDeductionPaise: 0 })).toBe(3_000_000);
  });

  it('cannot go negative or out of range', () => {
    expect(() => netPayablePaise({ baseSalaryPaise: 100, totalTaDaPaise: 0, reimbursementPaise: 0, leaveDeductionPaise: 200 })).toThrow(RangeError);
    expect(() => netPayablePaise({ baseSalaryPaise: MAX_PAISE, totalTaDaPaise: MAX_PAISE * 3, reimbursementPaise: 0, leaveDeductionPaise: 0 })).toThrow(RangeError);
  });
});

describe('absent days', () => {
  it('cost what an unpaid-leave day costs: whole days × base ÷ 30, half up once', () => {
    expect(absentDeductionPaise(0, 3_000_000)).toBe(0);
    expect(absentDeductionPaise(1, 3_000_000)).toBe(leaveDeductionPaise(1, 3_000_000));
    expect(absentDeductionPaise(3, 3_000_000)).toBe(300_000);
    expect(absentDeductionPaise(1, 2_500_049)).toBe(83_335);
    expect(absentDeductionPaise(30, 3_000_000)).toBe(3_000_000);
  });

  it('are whole days from 0 to 30', () => {
    for (const bad of [-1, 0.5, 31, Number.NaN]) expect(() => absentDeductionPaise(bad, 3_000_000)).toThrow(RangeError);
  });

  it('together with unpaid leave never exceed a month, and only whole days are charged', () => {
    expect(chargeableAbsentDays(0, 4)).toBe(4);
    expect(chargeableAbsentDays(1, 4)).toBe(4);
    expect(chargeableAbsentDays(27, 4)).toBe(3);
    expect(chargeableAbsentDays(29.5, 4)).toBe(0); // half a day is left: not enough for a whole absent day
    expect(chargeableAbsentDays(30, 4)).toBe(0);
    expect(chargeableAbsentDays(0, 40)).toBe(30);
    expect(() => chargeableAbsentDays(0, 1.5)).toThrow(RangeError);
  });

  it('come off the net together with the leave deduction, and never take it below zero', () => {
    expect(netPayablePaise({ baseSalaryPaise: 3_000_000, totalTaDaPaise: 0, reimbursementPaise: 0, leaveDeductionPaise: 100_000, absentDeductionPaise: 200_000 })).toBe(2_700_000);
    expect(netPayablePaise({ baseSalaryPaise: 3_000_000, totalTaDaPaise: 0, reimbursementPaise: 0, leaveDeductionPaise: 0 })).toBe(3_000_000);
    expect(() => netPayablePaise({ baseSalaryPaise: 100, totalTaDaPaise: 0, reimbursementPaise: 0, leaveDeductionPaise: 60, absentDeductionPaise: 60 })).toThrow(RangeError);
  });
});

describe('the month’s own length (decision-log 2026-11-02)', () => {
  it('payDaysOf: October 31, November 30, February 28 or 29 by leap year', () => {
    expect(payDaysOf('2026-10')).toBe(31);
    expect(payDaysOf('2026-11')).toBe(30);
    expect(payDaysOf('2026-02')).toBe(28);
    expect(payDaysOf('2028-02')).toBe(29);
    expect(payDaysOf('2100-02')).toBe(28);
    expect(() => payDaysOf('2026-13x')).toThrow(RangeError);
  });

  it('a day is base ÷ the month: October ÷31, February ÷28', () => {
    expect(leaveDeductionPaise(1, 3_100_000, 31)).toBe(100_000);
    expect(leaveDeductionPaise(0.5, 3_100_000, 31)).toBe(50_000);
    expect(leaveDeductionPaise(31, 3_100_000, 31)).toBe(3_100_000);
    expect(leaveDeductionPaise(40, 3_100_000, 31)).toBe(3_100_000);
    expect(absentDeductionPaise(27, 2_700_000, 31)).toBe(2_351_613); // 27 days of ₹27,000 in October
    expect(absentDeductionPaise(28, 2_800_000, 28)).toBe(2_800_000);
    expect(() => absentDeductionPaise(31, 3_000_000, 30)).toThrow(RangeError);
  });

  it('leave and absent together never pass the month’s length', () => {
    expect(chargeableAbsentDays(27, 9, 31)).toBe(4);
    expect(chargeableAbsentDays(27, 9, 30)).toBe(3);
    expect(chargeableAbsentDays(27, 9)).toBe(3); // no month given: the old 30
  });

  it('a day change is priced by the same month', () => {
    expect(dayAdjustmentPaise(3_100_000, 1, 0, 31)).toBe(100_000);
    expect(dayAdjustmentPaise(2_800_000, 0, 1, 28)).toBe(-100_000);
    expect(dayAdjustmentPaise(3_100_000, 1, 0.5, 31)).toBe(50_000);
    const adj = [{ id: 'a', kind: 'DAY' as const, date: '2026-10-05', ruleDays: 1, setDays: 0, amountPaise: 0, reason: 'x', by: 'u', byRole: 'HR', at: new Date() }];
    const days = [{ date: '2026-10-05', status: 'ABSENT', deductedDays: 1, leaveType: null }];
    expect(adjustmentEffects(3_100_000, days, adj, 31).totalPaise).toBe(100_000);
  });
});
