import type { Paise } from '@/shared/money/paise.js';

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
  /** Snapshot of the Pay Band's base salary when generated — a later grade change never rewrites it. */
  baseSalaryPaise: Paise;
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
