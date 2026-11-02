import { describe, expect, it } from 'vitest';
import { monthlyOf, payslipOf, slipCountsOf } from './payslip';

const line = (name: string, amountPaise: number, kind: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION' = 'EARNING') => ({ code: name, name, kind, amountPaise, isOverridden: false });
const base = { totalTaDaPaise: 0, reimbursementPaise: 0, leaveDeductionPaise: 0, unpaidLeaveDays: 0, absentDays: 0, absentDeductionPaise: 0, deductionLines: [] as Array<{ code: string; name: string; amountPaise: number }>, statutoryDeductionPaise: 0, roundingPaise: 0 };

describe('monthlyOf', () => {
  it('is a twelfth, half up', () => {
    expect(monthlyOf(1200)).toBe(100);
    expect(monthlyOf(1206)).toBe(101); // 100.5
    expect(monthlyOf(1205)).toBe(100);
  });
});

describe('payslipOf', () => {
  it('lists the earning lines monthly, leaves employer contributions off, and nets the unpaid-leave deduction', () => {
    const slip = payslipOf({
      ...base,
      ctcLines: [line('Basic', 120_000), line('HRA', 60_000), line('EPF (employer)', 14_400, 'EMPLOYER_CONTRIBUTION')],
      baseSalaryPaise: 15_000,
      leaveDeductionPaise: 500,
      unpaidLeaveDays: 1,
      netPayablePaise: 14_500,
    });
    expect(slip.earnings).toEqual([{ label: 'Basic', amountPaise: 10_000 }, { label: 'HRA', amountPaise: 5_000 }]);
    expect(slip.deductions).toEqual([{ label: 'Unpaid leave (1 day)', amountPaise: 500 }]);
    expect([slip.grossPaise, slip.deductionPaise, slip.netPaise]).toEqual([15_000, 500, 14_500]);
  });

  it('adds a visible rounding line when the lines do not add to the run’s base', () => {
    const slip = payslipOf({ ...base, ctcLines: [line('A', 1_205), line('B', 1_205)], baseSalaryPaise: 201, netPayablePaise: 201 });
    expect(slip.earnings.map((e) => e.label)).toEqual(['A', 'B', 'Rounding']);
    expect(slip.grossPaise).toBe(201);
  });

  it('a run from before CTC existed is one Salary line, and older runs show TA/DA and reimbursements as paid in the month', () => {
    const slip = payslipOf({ ...base, ctcLines: [], baseSalaryPaise: 3_000_000, totalTaDaPaise: 28_003, reimbursementPaise: 5_000, netPayablePaise: 3_033_003 });
    expect(slip.earnings.map((e) => e.label)).toEqual(['Salary', 'TA and DA paid in the month', 'Reimbursements paid in the month']);
    expect(slip.grossPaise).toBe(3_033_003);
    expect(slip.deductions).toEqual([]);
  });

  it('pluralises the unpaid days', () => {
    expect(payslipOf({ ...base, ctcLines: [], baseSalaryPaise: 100, leaveDeductionPaise: 10, unpaidLeaveDays: 2.5, netPayablePaise: 90 }).deductions[0]?.label).toBe('Unpaid leave (2.5 days)');
  });
});

describe('absent days on the slip', () => {
  it('are their own deduction line after the unpaid leave, in days', () => {
    const p = payslipOf({ ...base, ctcLines: [], baseSalaryPaise: 3_000_000, leaveDeductionPaise: 100_000, unpaidLeaveDays: 1, absentDays: 3, absentDeductionPaise: 300_000, netPayablePaise: 2_600_000 });
    expect(p.deductions.map((d) => [d.label, d.amountPaise])).toEqual([['Unpaid leave (1 day)', 100_000], ['Absent (3 days)', 300_000]]);
    expect(p.deductionPaise).toBe(400_000);
    expect(payslipOf({ ...base, ctcLines: [], baseSalaryPaise: 100, absentDays: 1, absentDeductionPaise: 10, netPayablePaise: 90 }).deductions[0]?.label).toBe('Absent (1 day)');
  });

  it('shows the employee’s own EPF, ESI and professional tax first, a nil one too, and the net rounded to the rupee (the sample slip)', () => {
    const slip = payslipOf({
      ...base,
      ctcLines: [line('Basic Salary', 6_720_000), line('House Rent Allowance', 4_459_392), line('Fixed Dearness Allowance', 672_000), line('Conveyance Allowance', 2_860_032), line('Special Allowance', 2_088_576)],
      baseSalaryPaise: 1_400_000,
      deductionLines: [
        { code: 'EPF', name: 'EPF Contribution', amountPaise: 73_920 },
        { code: 'ESI', name: 'ESI Contribution', amountPaise: 0 },
        { code: 'PTAX', name: 'Professional Tax', amountPaise: 11_000 },
      ],
      statutoryDeductionPaise: 84_920,
      roundingPaise: 20,
      netPayablePaise: 1_315_100,
    });
    expect(slip.earnings.map((e) => [e.label, e.amountPaise])).toEqual([
      ['Basic Salary', 560_000],
      ['House Rent Allowance', 371_616],
      ['Fixed Dearness Allowance', 56_000],
      ['Conveyance Allowance', 238_336],
      ['Special Allowance', 174_048],
    ]);
    expect(slip.deductions.map((d) => [d.label, d.amountPaise])).toEqual([['EPF Contribution', 73_920], ['ESI Contribution', 0], ['Professional Tax', 11_000]]);
    expect([slip.grossPaise, slip.deductionPaise, slip.roundingPaise, slip.netPaise]).toEqual([1_400_000, 84_920, 20, 1_315_100]);
  });

  it('shows what could not be taken when the pay left was too small, so the lines still add up', () => {
    const slip = payslipOf({
      ...base,
      ctcLines: [line('Basic', 120_000)],
      baseSalaryPaise: 10_000,
      leaveDeductionPaise: 10_000,
      unpaidLeaveDays: 30,
      deductionLines: [{ code: 'PTAX', name: 'Professional Tax', amountPaise: 1_100 }],
      statutoryDeductionPaise: 0,
      netPayablePaise: 0,
    });
    expect(slip.deductions).toEqual([
      { label: 'Professional Tax', amountPaise: 1_100 },
      { label: 'Not deducted (pay too low)', amountPaise: -1_100 },
      { label: 'Unpaid leave (30 days)', amountPaise: 10_000 },
    ]);
    expect(slip.deductionPaise).toBe(10_000);
  });
});

describe('named extra pay (2026-11-02)', () => {
  const adj = (over: object) => ({ kind: 'AMOUNT' as const, amountPaise: 0, label: null, days: null, ...over });
  it('each named amount is its own line: a plus in earnings, a minus in deductions; the lines still add up', () => {
    const slip = payslipOf({
      ...base,
      ctcLines: [line('Basic', 120_000)],
      baseSalaryPaise: 10_000,
      adjustmentPaise: 2_000 - 484 + 100,
      adjustments: [adj({ amountPaise: 2_000, label: 'Bonus' }), adj({ amountPaise: -484, label: 'Penalty', days: 1.5 }), { kind: 'DAY' as const, amountPaise: 100, label: null, days: null }],
      netPayablePaise: 11_616,
    });
    expect(slip.earnings).toEqual([{ label: 'Basic', amountPaise: 10_000 }, { label: 'Bonus', amountPaise: 2_000 }, { label: 'Days changed by HR', amountPaise: 100 }]);
    expect(slip.deductions).toEqual([{ label: 'Penalty (1.5 days)', amountPaise: 484 }]);
    expect(slip.grossPaise - slip.deductionPaise).toBe(11_616);
  });

  it('an older adjustment with no name stays one "Adjustment" line', () => {
    const slip = payslipOf({ ...base, ctcLines: [line('Basic', 120_000)], baseSalaryPaise: 10_000, adjustmentPaise: 500, adjustments: [adj({ amountPaise: 500 })], netPayablePaise: 10_500 });
    expect(slip.earnings.at(-1)).toEqual({ label: 'Adjustment', amountPaise: 500 });
  });
});

describe('slipCountsOf — the slip’s day counts follow HR’s day changes', () => {
  const days = [
    { date: '2026-10-05', status: 'ABSENT', deductedDays: 1 },
    { date: '2026-10-06', status: 'LEAVE', deductedDays: 1 },
    { date: '2026-10-07', status: 'PRESENT', deductedDays: 0 },
  ];
  const run = { unpaidLeaveDays: 1, absentDays: 1, payDays: 31, days };
  it('with no changes: 31 − 1 − 1 attended', () => {
    expect(slipCountsOf(run)).toEqual({ unpaidLeaveDays: 1, absentDays: 1, attendedDays: 29 });
  });
  it('an absent day made Paid leave leaves the Absent count; a worked day made Absent joins it', () => {
    const adjustments = [
      { kind: 'DAY' as const, date: '2026-10-05', setDays: 0, outcome: 'PAID_LEAVE' as const },
      { kind: 'DAY' as const, date: '2026-10-07', setDays: 1, outcome: 'ABSENT' as const },
    ];
    expect(slipCountsOf({ ...run, adjustments })).toEqual({ unpaidLeaveDays: 1, absentDays: 1, attendedDays: 29 });
  });
  it('the latest change to a date counts; Unpaid leave goes to the leave count', () => {
    const adjustments = [
      { kind: 'DAY' as const, date: '2026-10-07', setDays: 1, outcome: 'ABSENT' as const },
      { kind: 'DAY' as const, date: '2026-10-07', setDays: 1, outcome: 'UNPAID_LEAVE' as const },
    ];
    expect(slipCountsOf({ ...run, adjustments })).toEqual({ unpaidLeaveDays: 2, absentDays: 1, attendedDays: 28 });
  });
});
