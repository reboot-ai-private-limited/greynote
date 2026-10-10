/** What a line was before a change: who changed it, when, and the values it had. */
export interface EmployeeSaleRevision {
  by: string;
  at: Date;
  secondaryQty: number | null;
  adjustmentQty: number;
  adjustmentReason: string | null;
}

/**
 * One field employee's figures for one product and one month (decision-log 2026-10-10). **Secondary** is what they say they sold; it is their
 * achievement, valued at PTR. **Adjustment** is Admin's change to their primary (their Done distributor orders, which are never stored here); it
 * needs a reason. The two have separate writers and never overwrite each other. Nothing here touches any distributor's stock.
 */
export interface EmployeeSale {
  id: string;
  userId: string;
  productId: string;
  month: string;
  secondaryQty: number | null;
  adjustmentQty: number;
  adjustmentReason: string | null;
  updatedBy: string;
  updatedAt: Date;
  history: EmployeeSaleRevision[];
}
