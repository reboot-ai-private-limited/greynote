/**
 * Field Master Data over HTTP (Admin portal): Products, Chemists, Distributors, Doctors, the
 * Doctor ↔ MR assignment and a Doctor's sample allocations. Dates are ISO strings on the wire.
 * The offline snapshot the phone pulls is a different, smaller shape (`FieldMasterDataSnapshot`).
 */
import type { GeoPoint } from './geofence.js';

/** Soft-deleted only: `inactive` hides a record from new use but keeps its history. */
export const MASTER_STATUSES = ['active', 'inactive'] as const;
export type MasterStatus = (typeof MASTER_STATUSES)[number];

/** `pending` is a Doctor an MR added that has not been approved yet; the field cannot see or use it. */
export const DOCTOR_STATUSES = ['pending', 'active', 'inactive'] as const;
export type DoctorStatus = (typeof DOCTOR_STATUSES)[number];

// ── Products ───────────────────────────────────────────────────────────────────────────────

export interface ProductDto {
  id: string;
  name: string;
  /** Unique ignoring case and surrounding spaces. */
  sku: string;
  category: string;
  status: MasterStatus;
}
export interface CreateProductDto {
  name: string;
  sku: string;
  category: string;
}
export interface UpdateProductDto {
  name?: string;
  sku?: string;
  category?: string;
  status?: MasterStatus;
}

// ── Chemists ───────────────────────────────────────────────────────────────────────────────

export interface ChemistDto {
  id: string;
  routeId: string;
  name: string;
  address: string;
  /** `null` until set: the geofence check cannot run for a Chemist with no point. */
  location: GeoPoint | null;
  status: MasterStatus;
}
export interface CreateChemistDto {
  routeId: string;
  name: string;
  address: string;
  location?: GeoPoint | null;
}
export interface UpdateChemistDto {
  routeId?: string;
  name?: string;
  address?: string;
  /** `null` clears the registered location. */
  location?: GeoPoint | null;
  status?: MasterStatus;
}

// ── Doctors ────────────────────────────────────────────────────────────────────────────────

export interface DoctorDto {
  id: string;
  routeId: string;
  category: string;
  name: string;
  address: string;
  email: string | null;
  specialty: string;
  qualification: string;
  /** What the geofence compares against. `null` until set. */
  location: GeoPoint | null;
  /** The MR phone's GPS when it added the Doctor. Kept when Admin corrects `location`; `null` for Admin-added. */
  capturedLocation: GeoPoint | null;
  status: DoctorStatus;
  /** The Admin or MR who added it. */
  addedBy: string;
  clientRequestId: string | null;
  /** When it became usable; the coverage wait counts from here. */
  approvedAt: string | null;
  /** The MR responsible now, if any. */
  assignedTo: { userId: string; name: string; employeeCode: string } | null;
}
export interface CreateDoctorDto {
  routeId: string;
  category: string;
  name: string;
  address: string;
  specialty: string;
  qualification: string;
  email?: string | null;
  location?: GeoPoint | null;
}
export interface UpdateDoctorDto {
  routeId?: string;
  category?: string;
  name?: string;
  address?: string;
  specialty?: string;
  qualification?: string;
  /** `null` clears it. */
  email?: string | null;
  /** `null` clears the registered location. */
  location?: GeoPoint | null;
  /** Admin can only move a Doctor between `active` and `inactive`; `pending` is the approval's. */
  status?: MasterStatus;
}

/** One row of `GET /doctors/:id/assignments`, newest first. At most one is `active`. */
export interface DoctorAssignmentDto {
  id: string;
  doctorId: string;
  userId: string;
  status: 'active' | 'inactive';
  assignedAt: string;
  assignedBy: string;
  unassignedAt: string | null;
  unassignedBy: string | null;
}

/** Samples of one Product issued for a Doctor, and what is left to give out. */
export interface SampleAllocationDto {
  id: string;
  doctorId: string;
  productId: string;
  productName: string;
  productSku: string;
  quantityAllocated: number;
  quantityRemaining: number;
  allocatedBy: string;
  allocatedAt: string;
}
export interface IssueSampleDto {
  productId: string;
  quantity: number;
}
export interface AdjustSampleDto {
  quantityAllocated: number;
}

// ── Distributors ───────────────────────────────────────────────────────────────────────────

export interface DistributorDto {
  id: string;
  routeId: string;
  name: string;
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  address: string;
  location: GeoPoint | null;
  assignedMrId: string | null;
  assignedAsmId: string | null;
  primarySalesEnabled: boolean;
  secondarySalesEnabled: boolean;
  status: MasterStatus;
}
/** `GET /distributors/:id`: the Distributor with its Route's place in the hierarchy (ids only). */
export interface DistributorDetailDto extends DistributorDto {
  path: { routeId: string; areaId: string; areaType: 'HQ' | 'EX_STATION' | 'OUT_STATION'; hqId: string; zoneId: string } | null;
}
export interface CreateDistributorDto {
  routeId: string;
  name: string;
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  address: string;
  location?: GeoPoint | null;
  assignedMrId?: string | null;
  assignedAsmId?: string | null;
  /** No default: whether a Distributor may take primary or secondary orders is Admin's call. */
  primarySalesEnabled: boolean;
  secondarySalesEnabled: boolean;
}
export interface UpdateDistributorDto {
  routeId?: string;
  name?: string;
  gstNumber?: string;
  contactPerson?: string;
  mobile?: string;
  address?: string;
  location?: GeoPoint | null;
  /** `null` un-assigns. */
  assignedMrId?: string | null;
  assignedAsmId?: string | null;
  primarySalesEnabled?: boolean;
  secondarySalesEnabled?: boolean;
  status?: MasterStatus;
}
