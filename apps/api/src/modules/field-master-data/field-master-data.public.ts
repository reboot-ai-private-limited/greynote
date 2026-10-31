import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Chemist as StoredChemist } from './domain/chemist.entity.js';
import type { Doctor } from './domain/doctor.entity.js';
import type { Distributor } from './domain/distributor.entity.js';
import type { SampleAllocation } from './domain/sampleAllocation.entity.js';
import type { GeoPoint } from './domain/masterStatus.js';
import type { Product } from './domain/product.entity.js';

export type { Distributor } from './domain/distributor.entity.js';
export type { SampleAllocation } from './domain/sampleAllocation.entity.js';
export type { Doctor } from './domain/doctor.entity.js';
/** A Chemist other modules can see: a `pending` one (added by an employee, not yet approved) never leaves this module. */
export type Chemist = StoredChemist & { status: 'active' | 'inactive' };
export type { GeoPoint } from './domain/masterStatus.js';
export type { Product } from './domain/product.entity.js';

/**
 * The only thing another module may import from `field-master-data/`. Grows with the module: Doctors,
 * assignments, Distributors and sample allocations join it in the steps that build them.
 */
export interface FieldMasterDataPublicContract {
  /** A leaving employee's doctors and the distributors that list them (decision-log 2026-10-22). */
  countLeaverWork(userId: string): Promise<{ doctors: number; distributors: number }>;
  /** Their doctors go to `handoverTo` where that person has the route, the rest are left unassigned (and leave their plans). */
  releaseLeaverDoctors(userId: string, handoverTo: string | null, actorId: string): Promise<{ handedOver: number; unassigned: number }>;
  /** They come off every distributor's assigned people; returns how many distributors changed. */
  releaseLeaverDistributors(userId: string): Promise<number>;
  /** How many Doctors, Chemists and Distributors sit on these Routes (any status): what a permanent route delete would leave without one. */
  countOnRoutes(routeIds: string[]): Promise<{ doctors: number; chemists: number; distributors: number }>;
  /**
   * Where the Chemist is supposed to be. `null` means the geofence check **cannot run** — either
   * the Chemist doesn't exist or has no registered location — never that the check passed.
   */
  /**
   * Where the Doctor is supposed to be. `null` means the geofence check **cannot run** (no such
   * Doctor, still `pending` approval, or no registered location), never that it passed.
   */
  getDoctorLocation(doctorId: string): Promise<GeoPoint | null>;
  /**
   * `null` for an unknown Doctor and for one still `pending` approval — it doesn't exist yet for other modules. A permanently
   * deleted Doctor answers from the archive as `inactive`, so history still has its name.
   */
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
  /** What every distributor owed when it was set up, added up (inactive ones too): the starting point of the total dues. */
  sumOpeningDues(): Promise<number>;
  /** Every active Product, by name — the rows of a stock statement. */
  listActiveProducts(): Promise<Product[]>;
  /**
   * Names for a batch of Distributors, Chemists and Products in three queries — what a report needs to put words on ids. A product also carries the
   * prices a report values stock with. An id that is not there is left out.
   */
  /** Every active Distributor and Chemist, by name: who a report expects a stock count from. */
  /** Every active Distributor with the field employees it is handed to: whose achievement its secondary counts toward. */
  listDistributorAssignees(): Promise<Array<{ id: string; assignedUserIds: string[] }>>;
  listActiveOutlets(): Promise<{ distributors: Array<{ id: string; name: string }>; chemists: Array<{ id: string; name: string }> }>;
  listNames(query: { distributorIds?: string[]; chemistIds?: string[]; productIds?: string[] }): Promise<{
    distributors: Array<{ id: string; name: string }>;
    chemists: Array<{ id: string; name: string }>;
    products: Array<{ id: string; name: string; sku: string; division: string | null; ptsPaise: number | null; ptrPaise: number | null; mrpPaise: number | null }>;
  }>;
  /**
   * Gates Order and MonthlyStock creation: the Distributor is active and the user is its assigned
   * MR, or covers its Route. A manager's access is the caller's to resolve through the reporting
   * chain, not here.
   */
  canActOnDistributor(userId: string, distributorId: string): Promise<boolean>;
  /** Gates a Chemist's monthly stock: the Chemist is active and on a Route the user covers. Managers/Admin are the caller's to resolve. */
  canActOnChemist(userId: string, chemistId: string): Promise<boolean>;
  /** The active Chemists on the user's Routes and the active Distributors they are assigned to or cover — the outlets they count stock at. */
  listOutletsForUser(userId: string): Promise<{ chemists: Chemist[]; distributors: Distributor[] }>;
  /** The Doctor's allocation of one Product, or `null` if none has been issued. */
  getSampleAllocation(doctorId: string, productId: string): Promise<SampleAllocation | null>;
  /**
   * Takes `quantity` off an allocation's remaining count in one conditional update, so two sample
   * gives racing on the last unit can't both succeed: `false` (nothing changed) if less than that is left.
   * Pass the caller's transaction `ctx` to make it part of the Dr Call's write.
   */
  decrementRemaining(allocationId: string, quantity: number, ctx?: TransactionContext): Promise<boolean>;
  /** Gives `quantity` back to an allocation (a Dr Call deleted before the daily report was submitted). */
  restoreRemaining(allocationId: string, quantity: number, ctx?: TransactionContext): Promise<void>;
}
