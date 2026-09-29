import type { MasterStatus } from './masterStatus.js';

/** The single catalog for orderable and sample-eligible items; a "sample" is one that's been allocated. */
export interface Product {
  id: string;
  name: string;
  /** Unique ignoring case and surrounding spaces. */
  sku: string;
  category: string;
  status: MasterStatus;
}
