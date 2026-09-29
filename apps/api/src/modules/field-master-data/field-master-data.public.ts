import type { Chemist } from './domain/chemist.entity.js';
import type { Doctor } from './domain/doctor.entity.js';
import type { GeoPoint } from './domain/masterStatus.js';
import type { Product } from './domain/product.entity.js';

export type { Doctor } from './domain/doctor.entity.js';
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
  /**
   * Where the Doctor is supposed to be. `null` means the geofence check **cannot run** (no such
   * Doctor, or no registered location), never that it passed.
   */
  getDoctorLocation(doctorId: string): Promise<GeoPoint | null>;
  getDoctor(doctorId: string): Promise<Doctor | null>;
  /**
   * Whether this MR is the Doctor's assigned MR **and** can currently see it — the Doctor is active
   * and, while `DOCTOR_VISIBILITY_FOLLOWS_ROUTE` is on, on a Route the MR still has. Gates who may
   * draw samples or act on the Doctor.
   */
  isAssignedToDoctor(userId: string, doctorId: string): Promise<boolean>;
  /** An MR's Doctors under the same rule as `isAssignedToDoctor`, by name. */
  listAssignedDoctors(userId: string): Promise<Doctor[]>;
  getChemistLocation(chemistId: string): Promise<GeoPoint | null>;
  getChemist(chemistId: string): Promise<Chemist | null>;
  getProduct(productId: string): Promise<Product | null>;
}
