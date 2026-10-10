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
  updatedBy: { id: string; name: string } | null;
  updatedAt: string | null;
};
export type EmployeeSales = { userId: string; month: string; lines: EmployeeSalesLine[] };

export const getEmployeeSales = (userId: string, month: string) =>
  apiGet<EmployeeSales>(`/sales/employee-sales?userId=${userId}&month=${month}`, { fy: true });

/** Saves the secondary quantities for a month (whole units; the server refuses a closed or future month). */
export const saveEmployeeSecondary = (body: { userId: string; month: string; lines: { productId: string; qty: number }[] }) =>
  apiPost<{ added: number; changed: number }>('/sales/employee-secondary', body, { auth: true });

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
