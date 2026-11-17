import { apiDelete, apiGet, apiUpload, type UploadFile } from './api';

/**
 * The employee's own sales figures (decision-log 2026-10-10): targets are set per product, the employee enters the
 * secondary they sold, and achievement is that secondary measured against the target. Primary (Done distributor
 * orders plus any Admin change) is shown beside it but is not the achievement. All of this is read or saved online.
 */

/** A photo or PDF attached to the month as proof of the figures (docs/mobile/secondary-and-targets.md section 1b). */
export type SecondaryAttachment = {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: unknown;
  uploadedAt: string;
};
/** Attaches one file to the month (PDF, JPG or PNG, up to 5 MB; send several files as several calls). Online only. */
export const addSecondaryFile = (month: string, file: UploadFile, userId?: string) =>
  apiUpload<SecondaryAttachment>('/sales/employee-secondary/attachments', file, 'POST', userId ? { month, userId } : { month });

export const removeSecondaryFile = (id: string) => apiDelete<unknown>(`/sales/employee-secondary/attachments/${id}`);

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
  flags: ('NO_PTS' | 'NO_PTS_CHANGE')[];
};
export type EmployeeTargetFigure = {
  id: string;
  product: { id: string; name: string } | null;
  fromMonth: string;
  toMonth: string;
  amountPaise: number;
  achievedPaise: number;
  achievementPercent: number | null;
  /** The target in units (a product target with a PTS); `null` otherwise. Units × PTS is the amount. */
  targetQty: number | null;
  /** Units achieved in those months (counted from the distributors' stock since 2026-10-14), and as a percent of `targetQty`. */
  achievedQty: number;
  achievementQtyPercent: number | null;
};
/** The employee's Done orders to one distributor in the months; the rows add up to the order part of `totals.primaryPaise`. */
export type EmployeeDistributorFigure = { distributor: { id: string; name: string }; orderQty: number; orderPaise: number };
export type EmployeeSalesReport = {
  /** From 2026-10-14; missing from an older server. */
  distributors?: EmployeeDistributorFigure[];
  employee: { id: string; name: string; employeeCode: string };
  fromMonth: string;
  toMonth: string;
  products: EmployeeProductFigure[];
  generalTargetPaise: number;
  totals: { targetPaise: number; primaryPaise: number; secondaryPaise: number; achievementPercent: number | null };
  targets: EmployeeTargetFigure[];
  /** Only for a manager: their figures are the sum of every MR in their downline (they have no target of their own). */
  team?: {
    mrCount: number;
    /** MRs below who have an approved report in the range. Absent from older servers. */
    approvedMrCount?: number;
    /** The approved MR reports below, added up live: approved by their manager, not yet signed off by the manager's own manager. */
    waitingPaise?: number;
    waitingPrimaryPaise?: number;
    /** Where the manager's own team report for the month stands; it counts as their achievement once approved. */
    reportStatus?: 'NOT_SUBMITTED' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  } | null;
};

/** Months are `YYYY-MM`, both inclusive. */
export const getEmployeeSalesReport = (userId: string, from: string, to: string) =>
  apiGet<EmployeeSalesReport>(`/reports/employee-sales?userId=${userId}&from=${from}&to=${to}`, { fy: true });
