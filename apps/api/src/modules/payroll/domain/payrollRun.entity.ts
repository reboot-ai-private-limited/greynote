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
  /** TA + DA marked paid during the month. */
  totalTaDaPaise: Paise;
  /** Manual expenses (travel, meals, other) marked paid during the month. */
  reimbursementPaise: Paise;
  /** Approved unpaid leave days in the month, halves allowed — what the deduction was worked out from. */
  unpaidLeaveDays: number;
  leaveDeductionPaise: Paise;
  /** `base + TA/DA + reimbursement − leave deduction`. */
  netPayablePaise: Paise;
  /** The joining date falls in this month; the full base salary is paid (no proration) and the Accountant is told. */
  joinedInMonth: boolean;
  status: PayrollStatus;
  generatedBy: string;
  generatedAt: Date;
  finalizedAt: Date | null;
}

export type PayrollDraft = Omit<PayrollRun, 'id' | 'status' | 'finalizedAt'>;
