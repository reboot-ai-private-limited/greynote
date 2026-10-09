import { PAYMENT_MODES, type PaymentMode } from '@greynote/contracts';
import type { Paise } from '@/shared/money/paise.js';

export { PAYMENT_MODES, type PaymentMode };
export const PAYMENT_STATUSES = ['RECORDED', 'CANCELLED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Money received from a distributor, entered by Admin or the Accountant (decision-log 2026-10-09, resolving sign-off E6). Never edited: a wrong
 * entry is cancelled, with a reason, and entered again, so the record of what was written stays.
 */
export interface DistributorPayment {
  id: string;
  distributorId: string;
  /** The day the money was received, `YYYY-MM-DD` in the business timezone. */
  paymentDate: string;
  amountPaise: Paise;
  mode: PaymentMode;
  reference: string | null;
  note: string | null;
  status: PaymentStatus;
  recordedBy: string;
  createdAt: Date;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
}
