import type { Chemist } from './domain/chemist.entity.js';
import type { GeoPoint } from './domain/masterStatus.js';
import type { Product } from './domain/product.entity.js';

export type { Chemist } from './domain/chemist.entity.js';
export type { GeoPoint } from './domain/masterStatus.js';
export type { Product } from './domain/product.entity.js';

/**
 * The only thing another module may import from `field-master-data/`. Grows with the module: Doctors,
 * assignments, Distributors and sample allocations join it in the steps that build them.
 */
export interface FieldMasterDataPublicContract {
  /**
   * Where the Chemist is supposed to be. `null` means the geofence check **cannot run** — either
   * the Chemist doesn't exist or has no registered location — never that the check passed.
   */
  getChemistLocation(chemistId: string): Promise<GeoPoint | null>;
  getChemist(chemistId: string): Promise<Chemist | null>;
  getProduct(productId: string): Promise<Product | null>;
}
