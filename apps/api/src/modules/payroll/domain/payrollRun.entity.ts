import type { Paise } from '@/shared/money/paise.js';
import type { CtcLineSnapshot } from './ports.js';

/** One calendar day of the month as payroll saw it when the run was generated: what the day was and how much of it the rules charge (0, 0.5 or 1). */
export interface PayrollDay {
  date: string;
  /** The attendance status: `PRESENT`, `ABSENT`, `LEAVE`, `HOLIDAY`, `WEEKLY_OFF`, `STRIKE`, `NOT_YET`, `BEFORE_JOINING` or `UNKNOWN`. */
  status: string;
  /** Days of pay charged for this day by the rules: an absent day 1, an unpaid leave day its portion; 0 otherwise. */
  deductedDays: number;
  leaveType: string | null;
}

/**
 * HR's (or Admin's) change to a draft run, kept for good (decision-log 2026-10-13). `DAY`: the day is charged `setDays` instead of what the rules
 * gave (`ruleDays`), e.g. an absent day not charged; the latest change to a date is the one that counts. `AMOUNT`: a signed amount added to
 * (or taken off) the net. `amountPaise` is the effect on the net when it was made.
 */
export interface PayrollAdjustment {
  id: string;
  kind: 'DAY' | 'AMOUNT';
  date: string | null;
  ruleDays: number | null;
  setDays: number | null;
  amountPaise: number;
  reason: string;
  by: string;
  byRole: string;
  at: Date;
}

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
  /** `base − leave deduction − absent deduction + adjustments` (older runs also add TA/DA and reimbursement). */
  netPayablePaise: Paise;
  /** The month day by day as payroll saw it; empty on runs from before 2026-10-13. */
  days: PayrollDay[];
  /** What HR changed on the draft, oldest first. */
  adjustments: PayrollAdjustment[];
  /** The sum of the adjustments' effect on the net (signed). */
  adjustmentPaise: number;
  /** The net before any adjustment: what the rules gave. */
  originalNetPayablePaise: Paise;
  /** The employee's ESI number when generated (a snapshot, printed on the salary slip); null if none was set. */
  esiNumber: string | null;
  /** The employee's EPF number when generated (a snapshot for the salary slip); null if none was set. */
  epfNumber: string | null;
  /** The joining date falls in this month; the full base salary is paid (no proration) and the Accountant is told. */
  joinedInMonth: boolean;
  status: PayrollStatus;
  generatedBy: string;
  generatedAt: Date;
  finalizedAt: Date | null;
  finalizedBy: string | null;
  /** The Accountant marked the salary paid (the run is final from then on, and stays so). */
  paidAt: Date | null;
  paidBy: string | null;
  paymentReference: string | null;
}

export type PayrollDraft = Omit<PayrollRun, 'id' | 'status' | 'finalizedAt' | 'finalizedBy' | 'paidAt' | 'paidBy' | 'paymentReference'>;
