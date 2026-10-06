import type { GstRate, ProductType } from '@greynote/contracts';
import type { MasterStatus } from './masterStatus.js';

/** The single catalog for orderable and sample-eligible items; a "sample" is one that's been allocated. */
export interface Product {
  id: string;
  name: string;
  /** Unique ignoring case and surrounding spaces. */
  sku: string;
  /** The therapeutic class, e.g. Analgesic/Antipyretic. */
  category: string;
  composition: string | null;
  type: ProductType | null;
  /** As printed on the pack, e.g. `10×10`. */
  packSize: string | null;
  /** Price to stockist, retailer and the printed MRP, whole paise. `null` on a product saved before they existed. */
  ptsPaise: number | null;
  ptrPaise: number | null;
  mrpPaise: number | null;
  gstPercent: GstRate | null;
  division: string | null;
  status: MasterStatus;
}

/**
 * The price ladder: what the stockist pays is not more than what the retailer pays, which is not more than the MRP. Checked on the
 * prices as they will stand after a change; a product with a price still missing (an older one) has nothing to compare yet.
 * Returns the sentence for the first rung that is out of order, or `null`.
 */
export function priceLadderProblem(p: Pick<Product, 'ptsPaise' | 'ptrPaise' | 'mrpPaise'>): { field: 'ptsPaise' | 'ptrPaise' | 'mrpPaise'; message: string } | null {
  if (p.ptsPaise !== null && p.ptrPaise !== null && p.ptsPaise > p.ptrPaise) return { field: 'ptsPaise', message: 'PTS cannot be more than PTR.' };
  if (p.ptrPaise !== null && p.mrpPaise !== null && p.ptrPaise > p.mrpPaise) return { field: 'ptrPaise', message: 'PTR cannot be more than MRP.' };
  if (p.ptsPaise !== null && p.mrpPaise !== null && p.ptsPaise > p.mrpPaise) return { field: 'ptsPaise', message: 'PTS cannot be more than MRP.' };
  return null;
}
