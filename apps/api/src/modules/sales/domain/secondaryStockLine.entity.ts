import type { StockStatus } from './monthlyStock.entity.js';

/**
 * One MR's slice of one distributor's stock for one product and month, all in units (decision-log 2026-11-05). Every figure is the MR's own, so
 * slices of several MRs add up without counting anything twice: MR-A issued 2 + MR-B issued 4 = the distributor's 6. Closing is never stored.
 */
export interface SecondaryStockLine {
  id: string;
  userId: string;
  distributorId: string;
  productId: string;
  /** `YYYY-MM`. */
  month: string;
  openingQty: number;
  /** Received from the company; the MR's own Done orders prefill it, the MR may correct it. */
  primaryQty: number;
  /** Secondary: what the distributor issued onward in the month. */
  issuedQty: number;
  status: StockStatus;
  updatedAt: Date;
  /** Set when the manager above (or Admin) corrected the figures while the month was waiting for approval; cleared when the MR saves again. */
  managerEdit?: SecondaryManagerEdit | undefined;
}

/** What the MR had entered before the first correction is kept in `original`, so the approver and the report can see it was changed and by how much. */
export interface SecondaryManagerEdit {
  by: string;
  at: Date;
  reason: string;
  original: { openingQty: number; primaryQty: number; issuedQty: number };
}

/** What is left on the shelf: opening + received − issued. Negative means the figures do not add up and the entry is refused. */
export const closingOf = (l: Pick<SecondaryStockLine, 'openingQty' | 'primaryQty' | 'issuedQty'>): number => l.openingQty + l.primaryQty - l.issuedQty;

export interface SecondaryStockLineInput {
  distributorId: string;
  productId: string;
  openingQty: number;
  primaryQty: number;
  issuedQty: number;
}

/** A manager's correction of one line already waiting for approval. */
export interface SecondaryStockLineEdit extends SecondaryStockLineInput {
  managerEdit: SecondaryManagerEdit;
}

/** The previous month, `YYYY-MM`. */
export function previousMonthOf(month: string): string {
  const [y = 0, m = 1] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
