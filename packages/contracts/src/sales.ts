/** One row of `GET /sales/monthly-stock/missing` — one per MR with at least one outlet unreported. */
export interface MissingStockRowDto {
  userId: string;
  userName: string;
  outlets: { outletType: string; outletId: string; name: string }[];
}

export const PAYMENT_MODES = ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** One collection from a distributor (decision-log 2026-10-09). Cancelled ones stay on record and are left out of the totals. */
export interface DistributorPaymentDto {
  id: string;
  distributorId: string;
  /** `YYYY-MM-DD`, the day the money was received. */
  paymentDate: string;
  amountPaise: number;
  mode: PaymentMode;
  reference: string | null;
  note: string | null;
  status: 'RECORDED' | 'CANCELLED';
  recordedBy: { id: string; name: string };
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
}

/** `GET /sales/distributor-payments?distributorId=&from=&to=`: the range's collections, and how that compares with what was ordered. */
export interface DistributorPaymentsDto {
  from: string;
  to: string;
  payments: DistributorPaymentDto[];
  /** The sum of the `RECORDED` payments in the range. */
  collectedPaise: number;
  /** The sum of this distributor's non-cancelled orders dated in the range. */
  orderedPaise: number;
}

export interface RecordDistributorPaymentDto {
  distributorId: string;
  paymentDate: string;
  amountPaise: number;
  mode: PaymentMode;
  reference?: string | null;
  note?: string | null;
}
