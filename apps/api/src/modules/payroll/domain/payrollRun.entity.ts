import type { Paise } from '@/shared/money/paise.js';
import type { CtcLineSnapshot } from './ports.js';

export const PAYROLL_STATUSES = ['DRAFT', 'FINALIZED'] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

/**
 * One FIELD employee's pay for one month. `DRAFT` until an Accountant (or Admin) finalizes it; from then on every
 * figure is frozen, whatever later happens to the expenses or leave behind it.
 */
export interface PayrollRun {
  id: string;
  userId: string;
  /** `YYYY-MM`. */
  month: string;
  /**
   * The employee's monthly gross when generated: the CTC less the employer's EPF/ESI, ÷ 12 — a snapshot, so a later CTC
   * revision never rewrites it. (Runs from before CTC existed hold the old Pay Band salary here and no CTC fields.)
   */
  baseSalaryPaise: Paise;
  /** The annual CTC and the revision's first month it was worked out from; `null` on runs from before CTC existed. */
  ctcAnnualPaise: Paise | null;
  ctcEffectiveFrom: string | null;
  /** The breakdown at generation (annual amounts, employer contributions included); empty on older runs. */
  ctcLines: CtcLineSnapshot[];
  /**
   * TA + DA marked paid during the month. Only on runs finalized before 2026-10-06: TA/DA and reimbursements are paid in their own
   * payout on the 15th now (decision-log 2026-10-06), so a new run holds 0 here.
   */
  totalTaDaPaise: Paise;
  /** Manual expenses paid during the month; as above, 0 on a new run. */
  reimbursementPaise: Paise;
  /** Approved unpaid leave days in the month, halves allowed — what the deduction was worked out from. */
  unpaidLeaveDays: number;
  leaveDeductionPaise: Paise;
  /**
   * Days charged as absent: working days with no report, leave or strike (and strike days too while `STRIKE_DEDUCTS_SALARY` is on), only while
   * `ABSENT_DEDUCTS_SALARY` is on, and together with the unpaid leave never more than 30. `0` on runs from before 2026-10-07.
   */
  absentDays: number;
  /** `absent days × base ÷ 30`, rounded half up once and frozen; `0` on older runs. */
  absentDeductionPaise: Paise;
  /** `base − leave deduction − absent deduction` (older runs also add TA/DA and reimbursement). */
  netPayablePaise: Paise;
  /** The employee's ESI number when generated (a snapshot, printed on the salary slip); null if none was set. */
  esiNumber: string | null;
  /** The joining date falls in this month; the full base salary is paid (no proration) and the Accountant is told. */
  joinedInMonth: boolean;
  status: PayrollStatus;
  generatedBy: string;
  generatedAt: Date;
  finalizedAt: Date | null;
}

export type PayrollDraft = Omit<PayrollRun, 'id' | 'status' | 'finalizedAt'>;
