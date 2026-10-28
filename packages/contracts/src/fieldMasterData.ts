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

/** The dosage form, chosen from a list. */
export const PRODUCT_TYPES = ['TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'INJECTION', 'OINTMENT', 'CREAM_GEL', 'DROPS', 'POWDER', 'INHALER', 'OTHER'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];
export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  TABLET: 'Tablet',
  CAPSULE: 'Capsule',
  SYRUP: 'Syrup',
  SUSPENSION: 'Suspension',
  INJECTION: 'Injection',
  OINTMENT: 'Ointment',
  CREAM_GEL: 'Cream / gel',
  DROPS: 'Drops',
  POWDER: 'Powder / sachet',
  INHALER: 'Inhaler',
  OTHER: 'Other',
};

/** GST slabs, in percent, chosen from a list. */
export const GST_RATES = [5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

/**
 * A product. `name` is the brand (e.g. `XYZ-500`). `category` is its therapeutic class (e.g. Analgesic/Antipyretic). Prices are whole paise:
 * PTS (price to stockist) ≤ PTR (price to retailer) ≤ MRP. The fields added in 2026-10 are `null` on a product that was saved before them.
 */
export interface ProductDto {
  id: string;
  name: string;
  /** Unique ignoring case and surrounding spaces. */
  sku: string;
  category: string;
  composition: string | null;
  type: ProductType | null;
  /** As printed on the pack, e.g. `10×10`. */
  packSize: string | null;
  ptsPaise: number | null;
  ptrPaise: number | null;
  mrpPaise: number | null;
  gstPercent: GstRate | null;
  /** HSN/SAC printed on the Tax Invoice. */
  hsn: string | null;
  division: string | null;
  status: MasterStatus;
}
export interface CreateProductDto {
  name: string;
  sku: string;
  category: string;
  composition: string;
  type: ProductType;
  packSize: string;
  ptsPaise: number;
  ptrPaise: number;
  mrpPaise: number;
  gstPercent: GstRate;
  /** HSN/SAC, 4 to 8 digits. */
  hsn: string;
  /** Optional. */
  division?: string | undefined;
}
export interface UpdateProductDto {
  name?: string;
  sku?: string;
  category?: string;
  composition?: string;
  type?: ProductType;
  packSize?: string;
  ptsPaise?: number;
  ptrPaise?: number;
  mrpPaise?: number;
  gstPercent?: GstRate;
  hsn?: string;
  /** `null` clears it. */
  division?: string | null;
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

// ── Specialities ───────────────────────────────────────────────────────────────────────────

/** A speciality a Doctor can have, chosen from a list an Admin keeps. Unique ignoring case; no rank. */
export interface SpecialtyDto {
  id: string;
  name: string;
  status: MasterStatus;
}
export interface CreateSpecialtyDto {
  name: string;
}
export interface UpdateSpecialtyDto {
  /** A rename also renames it on the Doctors that carry it. */
  name?: string;
  status?: MasterStatus;
}

/** A doctor's visit frequency is 1 to this many visits a month (2026-10-22: 4; with the days between visits, more can't fit). */
export const MAX_VISIT_FREQUENCY = 4;

// ── Doctors ────────────────────────────────────────────────────────────────────────────────

export interface DoctorDto {
  id: string;
  routeId: string;
  name: string;
  address: string;
  email: string | null;
  clinicName: string | null;
  phone: string | null;
  /** The profile photo's address; `null` when none (every doctor added before photos existed). The storage id never leaves the server. */
  photoUrl: string | null;
  specialty: string;
  qualification: string;
  dateOfBirth: string | null;
  anniversary: string | null;
  /** Visits per month the MR should make (1–4); `null` = no target. */
  visitFrequency: number | null;
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
  /** A `pending` doctor's NEW_DOCTOR approval request (open it at `/approvals/:id`); `null` otherwise. */
  approvalRequestId: string | null;
}
export interface CreateDoctorDto {
  routeId: string;
  name: string;
  address: string;
  specialty: string;
  qualification: string;
  email?: string | null;
  clinicName?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  anniversary?: string | null;
  visitFrequency?: number | null;
  location?: GeoPoint | null;
}
export interface UpdateDoctorDto {
  routeId?: string;
  name?: string;
  address?: string;
  specialty?: string;
  qualification?: string;
  /** `null` clears it. */
  email?: string | null;
  clinicName?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  anniversary?: string | null;
  visitFrequency?: number | null;
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

export const DISTRIBUTOR_DOCUMENT_TYPES = ['DRUG_LICENCE', 'GST_CERTIFICATE', 'PAN', 'AGREEMENT', 'CANCELLED_CHEQUE', 'OTHER'] as const;
export type DistributorDocumentType = (typeof DISTRIBUTOR_DOCUMENT_TYPES)[number];
export interface DistributorDocumentDto {
  id: string;
  type: DistributorDocumentType;
  url: string;
  uploadedAt: string;
}

export interface DistributorDto {
  id: string;
  /**
   * Where it works. Each Zone, HQ and Route stands for everything under it: a Zone alone is all its HQs and so all their Routes,
   * an HQ alone is all its Routes. Zone, HQ and Route lists can each be empty, but not all three.
   */
  zoneIds: string[];
  hqIds: string[];
  routeIds: string[];
  name: string;
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  address: string;
  location: GeoPoint | null;
  /** Field employees (any designation) the Distributor is handed to. */
  assignedUserIds: string[];
  documents: DistributorDocumentDto[];
  /** What the distributor owed before this system, in whole paise. */
  openingDuesPaise: number;
  status: MasterStatus;
}
/** `GET /distributors/:id`: the Distributor with each Route's place in the hierarchy (ids only). */
export interface DistributorDetailDto extends DistributorDto {
  paths: Array<{ routeId: string; routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION'; hqId: string; zoneId: string }>;
}
export interface CreateDistributorDto {
  zoneIds: string[];
  hqIds: string[];
  routeIds: string[];
  name: string;
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  address: string;
  location?: GeoPoint | null;
  assignedUserIds?: string[];
  /** Defaults to 0. */
  openingDuesPaise?: number;
}
export interface UpdateDistributorDto {
  zoneIds?: string[];
  hqIds?: string[];
  routeIds?: string[];
  name?: string;
  gstNumber?: string;
  contactPerson?: string;
  mobile?: string;
  address?: string;
  location?: GeoPoint | null;
  /** The whole new list; `[]` un-assigns everyone. */
  assignedUserIds?: string[];
  openingDuesPaise?: number;
  status?: MasterStatus;
}

/**
 * `GET /field-master-data/distributors/:id/impact` (Admin): what deleting the distributor erases, shown before the delete.
 * Deleting is permanent and takes the distributor's whole history with it, so reports and dues totals change.
 */
export interface DistributorImpactDto {
  id: string;
  name: string;
  status: MasterStatus;
  payments: number;
  orders: number;
  /** Of `orders`, those still placed (not delivered or cancelled). */
  openOrders: number;
  monthlyStock: number;
  stockStatements: number;
  /** Uploaded files, deleted from storage. */
  documents: number;
  /** Employees it is handed to; the link goes with it. */
  assignedPeople: number;
}

/** `DELETE /field-master-data/distributors/:id`: what was erased. */
export interface DistributorDeleteResultDto {
  id: string;
  payments: number;
  orders: number;
  monthlyStock: number;
  stockStatements: number;
  documents: number;
}

/**
 * `GET /field-master-data/doctors/:id/impact` (Admin): what deactivating or deleting the doctor touches, shown before either.
 * Deactivating ends the assignment and drops the doctor from editable plans; deleting does that, archives the doctor and removes it.
 */
export interface DoctorImpactDto {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  /** Who is responsible for it now; they lose it on deactivate or delete. */
  assignedTo: { userId: string; name: string; employeeCode: string } | null;
  /** Daily Plans from today on that list it: `editable` ones lose it, `locked` ones (submitted or approved) keep it, but it can't be called. */
  plannedDays: { editable: number; locked: number };
  /** History, kept either way: calls made on it. */
  calls: number;
  /** Still open, kept either way, for Admin to close: gifts not handed over, services not done. */
  openGifts: number;
  openServices: number;
  /** Sample allocations (one per product) and the units still left on them; kept as history. */
  sampleAllocations: number;
  samplesRemaining: number;
  /** Visuals picked to show this doctor. */
  visuals: number;
}

/** `DELETE /field-master-data/doctors/:id`: the plans it was taken off. */
export interface DoctorDeleteResultDto {
  id: string;
  plansUpdated: number;
}
