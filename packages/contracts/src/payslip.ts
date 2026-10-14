import type { PayrollRunDto } from './payroll.js';

export interface SlipLine {
  label: string;
  amountPaise: number;
}

export interface Payslip {
  earnings: SlipLine[];
  deductions: SlipLine[];
  grossPaise: number;
  deductionPaise: number;
  /** What brought the net to a whole rupee (signed); shown beside the net, not in either table. */
  roundingPaise: number;
  netPaise: number;
}

/** One twelfth of an annual amount, half up, in whole paise. */
export const monthlyOf = (annualPaise: number): number => Math.floor((annualPaise + 6) / 12);

/**
 * The slip's figures from a run. The earnings are the CTC's earning lines a month at a time; the run's base was rounded once on the
 * sum, so a line that differs by a paise or two from it gets an explicit rounding line rather than a hidden fudge. Employer
 * contributions (old CTCs only) are not the employee's pay and stay off the slip. The deductions are the employee's own EPF, ESI and
 * professional tax first (each line as it was frozen, a nil one too), then unpaid leave, absent days and HR's adjustments. A run from before CTC existed has no lines, so it is one "Salary" line.
 * Runs from before TA/DA moved to their own payout also show those as earnings paid in the month.
 */
export function payslipOf(run: Pick<PayrollRunDto, 'ctcLines' | 'deductionLines' | 'statutoryDeductionPaise' | 'roundingPaise' | 'baseSalaryPaise' | 'totalTaDaPaise' | 'reimbursementPaise' | 'leaveDeductionPaise' | 'unpaidLeaveDays' | 'absentDays' | 'absentDeductionPaise' | 'netPayablePaise'> & { adjustmentPaise?: number }): Payslip {
  const earnings: SlipLine[] = run.ctcLines.filter((l) => l.kind === 'EARNING').map((l) => ({ label: l.name, amountPaise: monthlyOf(l.amountPaise) }));
  if (earnings.length === 0) earnings.push({ label: 'Salary', amountPaise: run.baseSalaryPaise });
  const lineSum = earnings.reduce((n, l) => n + l.amountPaise, 0);
  if (lineSum !== run.baseSalaryPaise) earnings.push({ label: 'Rounding', amountPaise: run.baseSalaryPaise - lineSum });
  if (run.totalTaDaPaise > 0) earnings.push({ label: 'TA and DA paid in the month', amountPaise: run.totalTaDaPaise });
  if (run.reimbursementPaise > 0) earnings.push({ label: 'Reimbursements paid in the month', amountPaise: run.reimbursementPaise });

  const deductions: SlipLine[] = run.deductionLines.map((l) => ({ label: l.name, amountPaise: l.amountPaise }));
  // Pay too low to take them in full (a month of unpaid leave): the slip shows what was not taken, so its lines still add up.
  const statutorySum = deductions.reduce((n, l) => n + l.amountPaise, 0);
  if (statutorySum !== run.statutoryDeductionPaise) deductions.push({ label: 'Not deducted (pay too low)', amountPaise: run.statutoryDeductionPaise - statutorySum });
  if (run.leaveDeductionPaise > 0) deductions.push({ label: `Unpaid leave (${run.unpaidLeaveDays} ${run.unpaidLeaveDays === 1 ? 'day' : 'days'})`, amountPaise: run.leaveDeductionPaise });
  if (run.absentDeductionPaise > 0) deductions.push({ label: `Absent (${run.absentDays} ${run.absentDays === 1 ? 'day' : 'days'})`, amountPaise: run.absentDeductionPaise });
  // HR's adjustments (decision-log 2026-10-13): a plus is shown with the earnings, a minus with the deductions.
  const adjustment = run.adjustmentPaise ?? 0;
  if (adjustment > 0) earnings.push({ label: 'Adjustment', amountPaise: adjustment });
  if (adjustment < 0) deductions.push({ label: 'Adjustment', amountPaise: -adjustment });
  const grossPaise = earnings.reduce((n, l) => n + l.amountPaise, 0);
  const deductionPaise = deductions.reduce((n, l) => n + l.amountPaise, 0);
  return { earnings, deductions, grossPaise, deductionPaise, roundingPaise: run.roundingPaise, netPaise: run.netPayablePaise };
}

/** A finalized run as the employee's own phone gets it: the run's figures and the slip built from them. */
export interface MyPayslipDto {
  id: string;
  /** `YYYY-MM`. */
  month: string;
  finalizedAt: string | null;
  slip: Payslip;
}
