/**
 * Where an employee's secondary stands: `DRAFT` while they enter it, `PENDING` once the month is sent to their manager, `APPROVED` or `REJECTED`
 * by the decision. Only `APPROVED` secondary counts toward achievement. An entry by a manager or Admin is `APPROVED` straight away.
 */
export const SECONDARY_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'] as const;
export type SecondaryStatus = (typeof SECONDARY_STATUSES)[number];

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
  /** The amount at PTR (`secondaryQty × PTR`) when the entry was made; null when the product had no PTR or nothing was entered. */
  secondaryAmountPaise: number | null;
  secondaryStatus: SecondaryStatus;
  adjustmentQty: number;
  adjustmentReason: string | null;
  updatedBy: string;
  updatedAt: Date;
  history: EmployeeSaleRevision[];
}
