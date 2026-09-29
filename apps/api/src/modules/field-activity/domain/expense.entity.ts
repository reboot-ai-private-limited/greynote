import type { Paise } from '@/shared/money/paise.js';

/** What an MR can claim by hand. TA and DA are `AUTO` only — the server computes them at the manager's approval. */
export const MANUAL_EXPENSE_TYPES = ['TRAVEL', 'MEAL', 'MISC'] as const;
export type ManualExpenseType = (typeof MANUAL_EXPENSE_TYPES)[number];
export type ExpenseType = 'TA' | 'DA' | ManualExpenseType;
export type ExpenseSource = 'AUTO' | 'MANUAL';
/** Separate from the DCR's approval: approval accepts the claim, the Accountant's mark-paid settles it. */
export type PaymentStatus = 'UNPAID' | 'PAID' | 'CANCELLED';

export interface Expense {
  id: string;
  dcrId: string;
  userId: string;
  reportDate: string;
  /** The Route behind an AUTO TA row; null otherwise. */
  routeId: string | null;
  type: ExpenseType;
  source: ExpenseSource;
  amountPaise: Paise;
  remarks: string | null;
  paymentStatus: PaymentStatus;
  /**
   * The DCR's claim has been accepted (past the manager) and not sent back since — the only rows the Accountant
   * audits and may pay. Set by the DCR's approval hook; a `PAID` row keeps it even if the DCR is later sent back.
   */
  accepted: boolean;
  /** AUTO TA only: a Route's distance could not be calculated, so the amount is artificially low. */
  distanceFlag: boolean;
  paidBy: string | null;
  paidAt: Date | null;
  /** The phone's id for a MANUAL expense — the sync client id; null for AUTO rows. */
  clientId: string | null;
  recordedAt: Date;
}
