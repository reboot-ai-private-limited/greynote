import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Chemist } from './domain/chemist.entity.js';
import type { Doctor } from './domain/doctor.entity.js';
import type { Distributor } from './domain/distributor.entity.js';
import type { SampleAllocation } from './domain/sampleAllocation.entity.js';
import type { GeoPoint } from './domain/masterStatus.js';
import type { Product } from './domain/product.entity.js';

export type { Distributor } from './domain/distributor.entity.js';
export type { SampleAllocation } from './domain/sampleAllocation.entity.js';
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
   * Doctor, still `pending` approval, or no registered location), never that it passed.
   */
  getDoctorLocation(doctorId: string): Promise<GeoPoint | null>;
  /** `null` for an unknown Doctor and for one still `pending` approval — it doesn't exist yet for other modules. */
  getDoctor(doctorId: string): Promise<Doctor | null>;
  /**
   * Whether this MR is the Doctor's assigned MR **and** can currently see it — the Doctor is active
   * and, while `DOCTOR_VISIBILITY_FOLLOWS_ROUTE` is on, on a Route the MR still has. Gates who may
   * draw samples or act on the Doctor.
   */
  isAssignedToDoctor(userId: string, doctorId: string): Promise<boolean>;
  /** The MR the Doctor is assigned to now, or `null` — unknown, `pending`, inactive or unassigned Doctor. Admin-created Services go to this MR. */
  getAssignedUserId(doctorId: string): Promise<string | null>;
  /** An MR's Doctors under the same rule as `isAssignedToDoctor`, by name. */
  listAssignedDoctors(userId: string): Promise<Doctor[]>;
  getChemistLocation(chemistId: string): Promise<GeoPoint | null>;
  getChemist(chemistId: string): Promise<Chemist | null>;
  getProduct(productId: string): Promise<Product | null>;
  getDistributor(distributorId: string): Promise<Distributor | null>;
  /**
   * Gates Order and MonthlyStock creation: the Distributor is active and the user is its assigned
   * MR, or covers its Route. A manager's access is the caller's to resolve through the reporting
   * chain, not here.
   */
  canActOnDistributor(userId: string, distributorId: string): Promise<boolean>;
  /** The Doctor's allocation of one Product, or `null` if none has been issued. */
  getSampleAllocation(doctorId: string, productId: string): Promise<SampleAllocation | null>;
  /**
   * Takes `quantity` off an allocation's remaining count in one conditional update, so two sample
   * gives racing on the last unit can't both succeed: `false` (nothing changed) if less than that is left.
   * Pass the caller's transaction `ctx` to make it part of the Dr Call's write.
   */
  decrementRemaining(allocationId: string, quantity: number, ctx?: TransactionContext): Promise<boolean>;
}
