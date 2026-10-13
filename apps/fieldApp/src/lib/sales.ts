import { apiGet, apiPost } from './api';

/**
 * The employee's own sales figures (decision-log 2026-10-10): targets are set per product, the employee enters the
 * secondary they sold, and achievement is that secondary measured against the target. Primary (Done distributor
 * orders plus any Admin change) is shown beside it but is not the achievement. All of this is read or saved online.
 */

/** One product of the employee's month (`GET /sales/employee-sales`). */
export type EmployeeSalesLine = {
  product: { id: string; name: string; sku: string };
  orderPrimaryQty: number;
  adjustmentQty: number;
  adjustmentReason: string | null;
  /** `orderPrimaryQty + adjustmentQty`. */
  primaryQty: number;
  /** What the employee entered; `null` = nothing entered yet. */
  secondaryQty: number | null;
  /** The same at PTR; `null` = nothing entered, or the product has no PTR (units only). */
  secondaryAmountPaise: number | null;
  /** The product's PTR, which links units and amount; `null` = none set. */
  ptrPaise: number | null;
  secondaryStatus: SecondaryStatus | null;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string | null;
};
/** DRAFT (the employee's own, not sent) → PENDING (with the manager) → APPROVED, or REJECTED. Only APPROVED counts toward achievement. */
export type SecondaryStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type EmployeeSales = { userId: string; month: string; secondaryStatus: SecondaryStatus | null; approvalRequestId: string | null; lines: EmployeeSalesLine[] };

export const getEmployeeSales = (userId: string, month: string) =>
  apiGet<EmployeeSales>(`/sales/employee-sales?userId=${userId}&month=${month}`, { fy: true });

/**
 * Saves the secondary for a month as a draft (the server refuses a closed or future month). Give units or an amount for each
 * line: the other follows from the product's PTR, and an amount is rounded to whole units.
 */
export const saveEmployeeSecondary = (body: { userId: string; month: string; lines: { productId: string; qty?: number; amountPaise?: number }[] }) =>
  apiPost<{ added: number; changed: number }>('/sales/employee-secondary', body, { auth: true });

/** Sends the month to the manager for approval: every draft or rejected line becomes PENDING. */
export const submitEmployeeSecondary = (month: string) => apiPost<unknown>('/sales/employee-secondary/submit', { month }, { auth: true });

/** The phone's words for each state. */
export const SECONDARY_STATUS_TEXT: Record<SecondaryStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Waiting for approval',
  APPROVED: 'Approved',
  REJECTED: 'Sent back',
};

/** One product of the report (`GET /reports/employee-sales`). */
export type EmployeeProductFigure = {
  product: { id: string; name: string; sku: string };
  targetPaise: number;
  primaryQty: number;
  primaryPaise: number;
  secondaryQty: number;
  secondaryPaise: number;
  /** A whole percent of the target; `null` = no target. */
  achievementPercent: number | null;
  flags: ('NO_PTR' | 'NO_PTS')[];
};
export type EmployeeTargetFigure = {
  id: string;
  product: { id: string; name: string } | null;
  fromMonth: string;
  toMonth: string;
  amountPaise: number;
  achievedPaise: number;
  achievementPercent: number | null;
  /** The target in units (a product target with a PTR); `null` otherwise. Units × PTR is the amount. */
  targetQty: number | null;
  /** Approved secondary units in those months, and as a percent of `targetQty`. */
  achievedQty: number;
  achievementQtyPercent: number | null;
};
export type EmployeeSalesReport = {
  employee: { id: string; name: string; employeeCode: string };
  fromMonth: string;
  toMonth: string;
  products: EmployeeProductFigure[];
  generalTargetPaise: number;
  totals: { targetPaise: number; primaryPaise: number; secondaryPaise: number; achievementPercent: number | null };
  targets: EmployeeTargetFigure[];
};

/** Months are `YYYY-MM`, both inclusive. */
export const getEmployeeSalesReport = (userId: string, from: string, to: string) =>
  apiGet<EmployeeSalesReport>(`/reports/employee-sales?userId=${userId}&from=${from}&to=${to}`, { fy: true });
