import type { Paise } from '@/shared/money/paise.js';

/** What an MR can claim by hand. TA and DA are `AUTO` only — the server computes them at the manager's approval. */
export const MANUAL_EXPENSE_TYPES = ['TRAVEL', 'MEAL', 'MISC'] as const;
export type ManualExpenseType = (typeof MANUAL_EXPENSE_TYPES)[number];
/** `OTHER`: the monthly statement's single manual category (decision-log 2026-10-10) — dated, with no DCR behind it. */
export type ExpenseType = 'TA' | 'DA' | 'OTHER' | ManualExpenseType;
export type ExpenseSource = 'AUTO' | 'MANUAL';
/** Separate from the DCR's approval: approval accepts the claim, the Accountant's mark-paid settles it. */
export type PaymentStatus = 'UNPAID' | 'PAID' | 'CANCELLED';

/** A receipt or other proof on an `OTHER` expense — at most 3 files of 5 MB each, a PDF, JPG or PNG. */
export const MAX_EXPENSE_ATTACHMENTS = 3;
export const MAX_EXPENSE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export interface ExpenseAttachment {
  id: string;
  url: string;
  /** The storage id — kept server-side so the file can be removed with the record; never sent to a client. */
  publicId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}
/** What a client sees of a file: everything but the storage id. */
export type ExpenseAttachmentView = Omit<ExpenseAttachment, 'publicId'>;
export const toAttachmentView = ({ publicId: _publicId, ...rest }: ExpenseAttachment): ExpenseAttachmentView => rest;

export interface Expense {
  id: string;
  /** The DCR an AUTO row or a legacy claim belongs to; null for an `OTHER` row of the monthly statement. */
  dcrId: string | null;
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
  /** The employee's month statement was approved — the Accountant pays only these rows. Set and cleared by the statement's approval hook. */
  monthApproved: boolean;
  /**
   * The month was finalized (decision-log 2026-10-13): amounts are locked and the row is payable. Payment needs `accepted`, `monthApproved` and this.
   * Optional so rows written before it existed read as not finalized; the migration sets it on rows that were already payable.
   */
  monthFinalized?: boolean;
  /** AUTO TA only: a Route's distance could not be calculated, so the amount is artificially low. */
  distanceFlag: boolean;
  paidBy: string | null;
  paidAt: Date | null;
  /** The phone's id for a MANUAL expense — the sync client id; null for AUTO rows. */
  clientId: string | null;
  recordedAt: Date;
  /** The first amount this row ever had, set the first time HR changes it (0 for a row HR added); null if it was never adjusted (decision-log 2026-10-13). */
  originalAmountPaise?: number | null;
  /** Proof of an `OTHER` row; always empty for every other row. */
  attachments: ExpenseAttachment[];
}

/** An expense as a client sees it: the proof files without their storage ids. */
export type ExpenseView = Omit<Expense, 'attachments'> & { attachments: ExpenseAttachmentView[] };
export const toExpenseView = (e: Expense): ExpenseView => ({ ...e, attachments: e.attachments.map(toAttachmentView) });
