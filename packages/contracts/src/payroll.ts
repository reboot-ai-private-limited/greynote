export interface PayrollCtcLineDto {
  code: string;
  name: string;
  kind: 'EARNING' | 'EMPLOYER_CONTRIBUTION';
  amountPaise: number;
  isOverridden: boolean;
}

export type PayrollStatus = 'DRAFT' | 'FINALIZED';

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
  /** TA and DA marked paid during the month. */
  totalTaDaPaise: number;
  /** Manual expenses (travel, meals, other) marked paid during the month. */
  reimbursementPaise: number;
  /** Approved unpaid leave days in the month, halves allowed. */
  unpaidLeaveDays: number;
  /** `unpaid days × base ÷ 30`, rounded half up once and frozen. */
  leaveDeductionPaise: number;
  /** `base + TA/DA + reimbursement − deduction`. */
  netPayablePaise: number;
  /** The joining date falls in this month: the full base is paid (no proration) and the Accountant is told. */
  joinedInMonth: boolean;
  status: PayrollStatus;
  generatedBy: string;
  generatedAt: string;
  finalizedAt: string | null;
}

export type PayrollSkipReason = 'MONTH_NOT_ENDED' | 'ALREADY_FINALIZED' | 'RUN_NOT_FOUND' | 'USER_NOT_FOUND' | 'NOT_FIELD_EMPLOYEE' | 'NO_CTC' | 'ERROR';

/** One employee's line in the result of `POST /payroll/generate`. One line failing never fails the rest. */
export type GenerateOutcomeDto =
  | { userId: string; userName: string; employeeCode: string; outcome: 'created' | 'updated'; run: PayrollRunDto }
  | { userId: string; userName: string; employeeCode: string; outcome: 'skipped'; reason: PayrollSkipReason; message: string };

export interface GeneratePayrollDto {
  /** `YYYY-MM`, a month that has ended. */
  month: string;
  /** Omit for every active field employee. */
  userIds?: string[];
}
