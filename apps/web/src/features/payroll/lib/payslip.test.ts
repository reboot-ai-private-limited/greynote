import { describe, expect, it } from 'vitest';
import { monthlyOf, payslipOf } from './payslip';

const line = (name: string, amountPaise: number, kind: 'EARNING' | 'EMPLOYER_CONTRIBUTION' = 'EARNING') => ({ code: name, name, kind, amountPaise, isOverridden: false });
const base = { totalTaDaPaise: 0, reimbursementPaise: 0, leaveDeductionPaise: 0, unpaidLeaveDays: 0 };

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
