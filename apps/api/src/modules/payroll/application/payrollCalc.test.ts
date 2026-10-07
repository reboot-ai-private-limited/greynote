import { describe, expect, it } from 'vitest';
import { MAX_PAISE } from '@/shared/money/paise.js';
import { absentDeductionPaise, chargeableAbsentDays, leaveDeductionPaise, netPayablePaise } from './payrollCalc.js';

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
