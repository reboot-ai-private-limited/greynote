export const OUTLET_TYPES = ['CHEMIST', 'DISTRIBUTOR'] as const;
export type OutletType = (typeof OUTLET_TYPES)[number];

/** The place stock is counted: exactly one Chemist or one Distributor. */
export interface Outlet {
  type: OutletType;
  id: string;
}

/** One outlet's opening and closing count of one Product for one month (`YYYY-MM`). One row per outlet + product + month. */
export interface MonthlyStock {
  id: string;
  outlet: Outlet;
  productId: string;
  month: string;
  openingQty: number;
  closingQty: number;
  recordedBy: string;
  recordedAt: Date;
  status?: StockStatus;
  /** The employees this count counts toward, fixed when it was approved so a later unassign changes nothing. Empty: the distributor's current assignees (older rows). */
  creditedUserIds?: string[];
}

/** A count the employee is still working on, has sent, or that was decided. A row with no status (older, or entered with approval off) reads APPROVED. */
export const STOCK_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export interface StockLine {
  productId: string;
  openingQty: number;
  closingQty: number;
}
