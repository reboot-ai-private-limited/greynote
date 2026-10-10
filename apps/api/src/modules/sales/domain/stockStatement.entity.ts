/** What a statement line was before a change: who changed it, when, and the values it had. The overwrite audit the LLD had deferred. */
export interface StatementRevision {
  by: string;
  at: Date;
  openingQty: number;
  secondaryQty: number | null;
  adjustmentQty: number;
  adjustmentReason: string | null;
}

/**
 * Admin's entry for one distributor, one product and one month (decision-log 2026-10-09): the opening, the secondary the distributor reported from its
 * own sales statement, and an adjustment to primary (supply with no app order, or a return) with its reason. Closing is never stored: it is
 * opening + primary − secondary. It sits beside the field workers' counts (`MonthlyStock`) and never overwrites them.
 */
export interface StockStatement {
  id: string;
  distributorId: string;
  productId: string;
  month: string;
  openingQty: number;
  secondaryQty: number | null;
  adjustmentQty: number;
  adjustmentReason: string | null;
  enteredBy: string;
  enteredAt: Date;
  updatedBy: string;
  updatedAt: Date;
  history: StatementRevision[];
}

export interface StatementLine {
  productId: string;
  openingQty: number;
  secondaryQty: number | null;
  adjustmentQty: number;
  reason: string | null;
}
