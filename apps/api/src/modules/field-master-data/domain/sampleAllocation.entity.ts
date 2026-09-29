/**
 * Admin-issued samples of a Product for a Doctor — one row per (Doctor, Product); issuing more tops
 * it up. `quantityRemaining` is what the field side can still give; it is only ever moved by
 * `decrementRemaining` (never below zero) or by Admin's issue/adjust.
 */
export interface SampleAllocation {
  id: string;
  doctorId: string;
  productId: string;
  quantityAllocated: number;
  quantityRemaining: number;
  /** The Admin who last issued or adjusted it. */
  allocatedBy: string;
  allocatedAt: Date;
}
