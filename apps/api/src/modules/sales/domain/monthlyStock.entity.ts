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
}

export interface StockLine {
  productId: string;
  openingQty: number;
  closingQty: number;
}
