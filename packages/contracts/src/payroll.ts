export interface PayrollCtcLineDto {
  code: string;
  name: string;
  kind: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  amountPaise: number;
  isOverridden: boolean;
}

export type PayrollStatus = 'DRAFT' | 'FINALIZED';
/** Where a month's salary stands for one employee, from not yet generated to paid. */
export type PayrollStageDto = 'NOT_GENERATED' | 'DRAFT' | 'FINALIZED' | 'PAID';

/** One day of the month as payroll saw it, and how much of it the rules charge. */
export interface PayrollDayDto {
  date: string;
  /** `PRESENT`, `ABSENT`, `LEAVE`, `HOLIDAY`, `WEEKLY_OFF`, `STRIKE`, `NOT_YET`, `BEFORE_JOINING`, `NOT_EMPLOYED` or `UNKNOWN`. */
  status: string;
  /** Days of pay charged by the rules: an absent day 1, an unpaid leave day its portion, else 0. */
  deductedDays: number;
  leaveType: string | null;
}
/** What HR (or Admin) changed on a draft: a day charged differently, or an amount added or taken off. */
export interface PayrollAdjustmentDto {
  id: string;
  kind: 'DAY' | 'AMOUNT';
  date: string | null;
  ruleDays: number | null;
  setDays: number | null;
  /** The effect on the net, signed (a day not charged adds a day of pay). */
  amountPaise: number;
  reason: string;
  by: { id: string; name: string; role: string };
  at: string;
}
export interface OverridePayrollDayDto {
  date: string;
  /** Days of pay to charge for the day: 0, 0.5 or 1. */
  setDays: number;
  reason: string;
}
export interface AdjustPayrollAmountDto {
  /** Signed whole paise, never zero: positive adds to the net, negative takes off. */
  amountPaise: number;
  reason: string;
}
export interface PayPayrollDto {
  reference?: string | null | undefined;
}

/** One employee's row of the month table. */
export interface PayrollOverviewRowDto {
  userId: string;
  userName: string;
  employeeCode: string;
  stage: PayrollStageDto;
  runId: string | null;
  baseSalaryPaise: number | null;
  unpaidLeaveDays: number;
  absentDays: number;
  /** Leave and absent deductions together. */
  deductionPaise: number;
  adjustmentPaise: number;
  netPayablePaise: number | null;
  finalizedAt: string | null;
  paidAt: string | null;
}
export interface PayrollOverviewDto {
  month: string;
  /** The first day payroll can be generated (the month is over). */
  generateFrom: string;
  canGenerate: boolean;
  rows: PayrollOverviewRowDto[];
}

/**
 * One payroll run: one field employee, one month. Money is integer paise. `base`, `TA/DA`, `reimbursement` and the deduction
 * are frozen when the run is generated; a finalized run never changes.
 */
export interface PayrollRunDto {
  id: string;
  userId: string;
  userName: string;
  employeeCode: string;
  /** `YYYY-MM`. */
  month: string;
  /** Monthly gross when generated: the CTC less the employer's EPF/ESI, ÷ 12, frozen. */
  baseSalaryPaise: number;
  /** The annual CTC and the month its revision started; `null` on runs from before CTC existed. */
  ctcAnnualPaise: number | null;
  ctcEffectiveFrom: string | null;
  /** The breakdown at generation (annual amounts, employer contributions included); empty on older runs. */
  ctcLines: PayrollCtcLineDto[];
  /** TA and DA marked paid during the month. Only on runs from before 2026-10-06: a new run holds 0 (TA/DA have their own payout). */
  totalTaDaPaise: number;
  /** Manual expenses (travel, meals, other) marked paid during the month. */
  reimbursementPaise: number;
  /** Approved unpaid leave days in the month, halves allowed. */
  unpaidLeaveDays: number;
  /** `unpaid days × base ÷ 30`, rounded half up once and frozen. */
  leaveDeductionPaise: number;
  /** Days charged as absent (and strike days while that is switched on); 0 on runs from before 2026-10-07 and while absent days are not deducted. */
  absentDays: number;
  /** `absent days × base ÷ 30`, rounded half up once and frozen. */
  absentDeductionPaise: number;
  /** `base − leave deduction − absent deduction + adjustments` (older runs also add TA/DA and reimbursement). */
  netPayablePaise: number;
  /** The month day by day as payroll saw it; empty on runs from before 2026-10-13. */
  days: PayrollDayDto[];
  adjustments: PayrollAdjustmentDto[];
  /** The adjustments' total effect on the net, signed. */
  adjustmentPaise: number;
  /** The net the rules gave, before any adjustment. */
  originalNetPayablePaise: number;
  /** The employee's ESI number when generated (a snapshot for the salary slip); null if none was set. */
  esiNumber: string | null;
  /** The employee's EPF number when generated (a snapshot for the salary slip); null if none was set. */
  epfNumber: string | null;
  /** Slip snapshot: designation, bank and joining date (`YYYY-MM-DD`) when generated; null if none was set. */
  designationName: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  dateOfJoining: string | null;
  /** The employee's own EPF, ESI and professional tax for the month, one line each; empty on runs from before 2026-10-14. */
  deductionLines: Array<{ code: string; name: string; amountPaise: number }>;
  /** What was actually taken for them (their sum, unless the pay left was smaller). */
  statutoryDeductionPaise: number;
  /** What was added (or taken) to bring the net to a whole rupee; signed. */
  roundingPaise: number;
  /** The joining date falls in this month: the full base is paid (no proration) and the Accountant is told. */
  joinedInMonth: boolean;
  /** The employee's last working day falls in this month: the full base salary is paid, as for joining. */
  leftInMonth: boolean;
  status: PayrollStatus;
  generatedBy: string;
  generatedAt: string;
  finalizedAt: string | null;
  finalizedByName: string | null;
  /** The Accountant marked the salary paid. */
  paidAt: string | null;
  paidByName: string | null;
  paymentReference: string | null;
}

export type PayrollSkipReason = 'MONTH_NOT_ENDED' | 'ALREADY_FINALIZED' | 'RUN_NOT_FOUND' | 'USER_NOT_FOUND' | 'NOT_FIELD_EMPLOYEE' | 'NO_CTC' | 'ERROR';

/** One employee's line in the result of `POST /payroll/generate`. One line failing never fails the rest. */
export type GenerateOutcomeDto =
  | { userId: string; userName: string; employeeCode: string; outcome: 'created' | 'updated'; run: PayrollRunDto }
  | { userId: string; userName: string; employeeCode: string; outcome: 'skipped'; reason: PayrollSkipReason; message: string };

/** `GET /payroll/warnings?month=`: who is missing a number. A warning only; nothing is refused. */
export interface PayrollWarningPersonDto {
  userId: string;
  name: string;
  employeeCode: string;
}
export interface PayrollWarningsDto {
  /** The `ESI_WAGE_CEILING` setting in force, in whole rupees: ESI covers a monthly gross at or below it. */
  esiCeilingRupees: number;
  /** In the month's payroll, at or below the ceiling, with no ESI number. */
  esiMissing: PayrollWarningPersonDto[];
  /** In the month's payroll with no EPF number. */
  epfMissing: PayrollWarningPersonDto[];
}

export interface GeneratePayrollDto {
  /** `YYYY-MM`, a month that has ended. */
  month: string;
  /** Omit for every active field employee. */
  userIds?: string[];
}

/** `GET /payroll/paid-totals`: the company total of salary marked paid in one month. No names, no per-employee amounts. */
export interface PaidMonthTotalDto {
  /** `YYYY-MM`. */
  month: string;
  /** How many employees were paid. */
  employees: number;
  paidPaise: number;
}
