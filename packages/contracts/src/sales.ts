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

/** One row of `GET /sales/distributor-payments/totals`: what a distributor paid over the range. Distributors with nothing recorded are left out. */
export interface DistributorPaymentTotalDto {
  distributorId: string;
  collectedPaise: number;
}

export interface RecordDistributorPaymentDto {
  distributorId: string;
  paymentDate: string;
  amountPaise: number;
  mode: PaymentMode;
  reference?: string | null;
  note?: string | null;
}

// ── Distributor monthly statement (decision-log 2026-10-09) ────────────────────────────────────────

export type StatementFlag = 'NEGATIVE_SECONDARY' | 'NEGATIVE_CLOSING' | 'COUNT_MISMATCH' | 'OPENING_MISMATCH';
export type StockFigureSource = 'STATEMENT' | 'FIELD_COUNT' | 'NONE';

/** One product of one distributor for one month in `GET /sales/distributor-statement`: what the system has, what Admin entered, and the result. */
export interface StatementLineDto {
  product: { id: string; name: string; sku: string };
  /** Whether Admin has saved a statement line for it. */
  saved: boolean;
  /** The statement's opening, else the field count's, else last month's closing; `openingSuggested` says it is not Admin's own entry. */
  openingQty: number | null;
  openingSuggested: boolean;
  /** Done orders marked Done in the month. */
  orderPrimaryQty: number;
  adjustmentQty: number;
  adjustmentReason: string | null;
  /** Orders + adjustment. */
  primaryQty: number;
  secondaryQty: number | null;
  closingQty: number | null;
  /** The field worker's count, when one was submitted. */
  count: { openingQty: number; closingQty: number; by: { id: string; name: string }; at: string } | null;
  source: StockFigureSource;
  flags: StatementFlag[];
  updatedBy: { id: string; name: string } | null;
  updatedAt: string | null;
}

export interface DistributorStatementDto {
  distributorId: string;
  month: string;
  lines: StatementLineDto[];
}

export interface SaveStatementLineDto {
  productId: string;
  openingQty: number;
  /** `null` = no secondary yet (only an adjustment, or the field count decides). */
  secondaryQty: number | null;
  /** Whole units, positive for stock supplied outside an app order, negative for a return. */
  adjustmentQty: number;
  /** Required when the adjustment is not zero. */
  reason?: string | null;
}

export interface SaveDistributorStatementDto {
  distributorId: string;
  month: string;
  lines: SaveStatementLineDto[];
}

/** One product of an employee's month: their Done distributor orders (primary), Admin's change to it, and the secondary they entered. */
export interface EmployeeSalesLineDto {
  product: { id: string; name: string; sku: string };
  /** Units in the employee's Done orders to distributors, in the month the orders were marked Done. */
  orderPrimaryQty: number;
  /** Admin's change to the primary, whole units (minus = taken off). `0` = none. */
  adjustmentQty: number;
  adjustmentReason: string | null;
  /** `orderPrimaryQty + adjustmentQty`. */
  primaryQty: number;
  /** What the employee entered as sold; `null` = nothing entered. */
  secondaryQty: number | null;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string | null;
}

export interface EmployeeSalesDto {
  userId: string;
  month: string;
  lines: EmployeeSalesLineDto[];
}

export interface SaveEmployeeSecondaryDto {
  userId: string;
  month: string;
  lines: Array<{ productId: string; qty: number }>;
}

export interface SaveEmployeePrimaryDto {
  userId: string;
  month: string;
  lines: Array<{ productId: string; adjustmentQty: number; reason?: string | null }>;
}
