/** One row of `GET /sales/monthly-stock/missing` — one per MR with at least one outlet unreported. */
export interface MissingStockRowDto {
  userId: string;
  userName: string;
  outlets: { outletType: string; outletId: string; name: string }[];
}

export const PAYMENT_MODES = ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** The part of a payment that settles one invoice (a Done order). */
export interface PaymentAllocationDto {
  orderId: string;
  /** The invoice's number, so a list can name it without a second call. */
  invoiceNumber: string | null;
  amountPaise: number;
}

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
  /** The invoices it pays, with how much to each; empty = all on account. */
  allocations: PaymentAllocationDto[];
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

/** `GET /sales/distributor-payments/outstanding`: what all distributors owe together (opening dues + delivered − collected, all time). */
export interface DistributorOutstandingDto {
  duesPaise: number;
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
  /** The invoices this payment settles and how much to each; the sum is at most `amountPaise`, the rest is on account. Each must be a Done order of this distributor with an invoice number, and the amount at most what is still due on it. */
  allocations?: Array<{ orderId: string; amountPaise: number }>;
}

// ── Invoices (decision-log 2026-10-27) ──────────────────────────────────────────────────────────────

export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

/** One row of `GET /sales/invoices`: a Done distributor order that has an invoice number. */
export interface InvoiceRowDto {
  /** The order's id: an invoice is its order. */
  orderId: string;
  invoiceNumber: string;
  /** `YYYY-MM-DD` the order was marked Done. */
  invoiceDate: string;
  distributor: { id: string; name: string };
  /** Supplied + GST, rounded to the rupee. */
  totalPaise: number;
  /** What `RECORDED` payments have allocated to it. */
  paidPaise: number;
  /** `totalPaise − paidPaise`. */
  duePaise: number;
  status: InvoiceStatus;
}

/** `GET /sales/invoices/:orderId`: everything the printed Tax Invoice shows. */
export interface InvoiceDetailDto extends InvoiceRowDto {
  distributor: { id: string; name: string; address: string | null; gstNumber: string | null; mobile: string | null };
  lines: Array<{ productName: string; sku: string; /** HSN/SAC, batch and expiry (`YYYY-MM`) as supplied; `null` on an invoice from before they were kept. */ hsn: string | null; batchNo: string | null; expiry: string | null; mrpPaise: number | null; suppliedQty: number; freeQty: number; unitPricePaise: number; gstPercent: number; amountPaise: number; gstPaise: number }>;
  taxablePaise: number;
  gstPaise: number;
  roundOffPaise: number;
}

/** `PATCH /sales/orders/:id/invoice-number`: gives a Done order from before invoices its number. */
export interface SetInvoiceNumberDto {
  invoiceNumber: string;
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

/** A discount the office gives on a distributor order's line or on the whole order: a percentage (up to two decimals) or a flat amount in paise. */
export type DiscountDto = { type: 'PERCENT'; percent: number } | { type: 'FIXED'; amountPaise: number };

export interface OrderLineInputDto {
  productId: string;
  /** Whole units, at least 1. */
  quantity: number;
  unitPricePaise: number;
  /** Units to give free on top (the office's; an employee's own order ignores it). Defaults to 0. */
  freeQty?: number;
  /** Discount on this line; distributor orders only, office only. */
  discount?: DiscountDto | null;
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
  /** Discount on the whole order, taken off after the line discounts; distributor orders only, office only. */
  discount?: DiscountDto | null;
}

/** `PATCH /sales/orders/:id`: replaces a PLACED order's lines (with the server's own arithmetic) and remarks. */
export interface EditOrderDto {
  remarks?: string | null;
  lines: OrderLineInputDto[];
  /** Discount on the whole order, taken off after the line discounts; distributor orders only, office only. */
  discount?: DiscountDto | null;
}

/**
 * `POST /sales/orders/:id/complete` (Admin or the Accountant): the invoice number, and optionally what was delivered, per ordered line. A line left out is supplied in full.
 * `line` is the line's 0-based position on the order: required when the product is on more than one line, otherwise the product finds its line.
 */
export interface CompleteOrderDto {
  /** The office's invoice number: required, up to 30 characters, used once. */
  invoiceNumber: string;
  supply?: Array<{ productId: string; line?: number; suppliedQty: number; freeQty: number; /** Required on a line with units supplied; `expiry` is `YYYY-MM`. */ batchNo?: string; expiry?: string }>;
}
