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
  /** The sum of this distributor's non-cancelled orders dated in the range: a Done order at what was delivered (free units excluded), the others as ordered. */
  orderedPaise: number;
  /** Where the distributor stands today, whatever the range. */
  dues: DistributorDuesDto;
}

/** What a distributor owes: `openingPaise + deliveredPaise − collectedPaise` (can be negative: paid ahead). */
export interface DistributorDuesDto {
  /** Owed before this system, set on the distributor. */
  openingPaise: number;
  /** Every Done order, at what was delivered (supplied × price; free units are not charged). */
  deliveredPaise: number;
  /** Every recorded payment (cancelled ones left out). */
  collectedPaise: number;
  duesPaise: number;
}

/** One row of `GET /sales/distributor-payments/balances`: what a distributor was delivered and paid, all time. Add the distributor's own opening dues for what they owe. Distributors with neither are left out. */
export interface DistributorBalanceDto {
  distributorId: string;
  deliveredPaise: number;
  collectedPaise: number;
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
  /** The same at PTS (units × the product's PTS); `null` = nothing entered or no PTS on the product. */
  secondaryAmountPaise: number | null;
  /** The product's PTS, which links units and amount; `null` = none set (units only). */
  ptsPaise: number | null;
  /** The product's PTR, for reference only; sales are no longer valued at it. */
  ptrPaise: number | null;
  /** `null` = nothing entered. Only `APPROVED` counts toward achievement. */
  secondaryStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string | null;
}

export interface EmployeeSalesDto {
  userId: string;
  month: string;
  /** The month's secondary as a whole: `PENDING` if any line waits, else `REJECTED`, `DRAFT`, `APPROVED`; `null` = nothing entered. */
  secondaryStatus: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  /** The approval request behind it, when the month was sent. */
  approvalRequestId: string | null;
  lines: EmployeeSalesLineDto[];
}

export interface SaveEmployeeSecondaryDto {
  userId: string;
  month: string;
  /** Units or amount: give one, the other follows from the product's PTR (an amount is rounded to whole units). */
  lines: Array<{ productId: string; qty?: number; amountPaise?: number }>;
}

export interface SaveEmployeePrimaryDto {
  userId: string;
  month: string;
  lines: Array<{ productId: string; adjustmentQty: number; reason?: string | null }>;
}

// ── Orders added or changed by the office ────────────────────────────────────────────────────────

export interface OrderLineInputDto {
  productId: string;
  /** Whole units, at least 1. */
  quantity: number;
  unitPricePaise: number;
  /** Units to give free on top (the office's; an employee's own order ignores it). Defaults to 0. */
  freeQty?: number;
}

/** `POST /sales/orders/on-behalf`: Admin or the Accountant adds an order for a field employee, credited to them. */
export interface PlaceOrderForDto {
  /** The field employee the order is credited to. */
  userId: string;
  outletType: 'DISTRIBUTOR' | 'CHEMIST';
  outletId: string;
  /** `YYYY-MM-DD`, not in the future; defaults to today. */
  orderDate?: string;
  remarks?: string | null;
  lines: OrderLineInputDto[];
}

/** `PATCH /sales/orders/:id`: replaces a PLACED order's lines (with the server's own arithmetic) and remarks. */
export interface EditOrderDto {
  remarks?: string | null;
  lines: OrderLineInputDto[];
}

/** `POST /sales/orders/:id/complete` (optional body, Admin or the Accountant): what was delivered, per ordered product. A product left out is supplied in full. */
export interface CompleteOrderDto {
  supply?: Array<{ productId: string; suppliedQty: number; freeQty: number }>;
}
