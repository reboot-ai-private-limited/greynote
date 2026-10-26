import type { GeoPoint, MasterStatus } from './masterStatus.js';

export const DISTRIBUTOR_DOCUMENT_TYPES = ['DRUG_LICENCE', 'GST_CERTIFICATE', 'PAN', 'AGREEMENT', 'CANCELLED_CHEQUE', 'OTHER'] as const;
export type DistributorDocumentType = (typeof DISTRIBUTOR_DOCUMENT_TYPES)[number];

export interface DistributorDocument {
  id: string;
  type: DistributorDocumentType;
  url: string;
  publicId: string;
  uploadedAt: Date;
}

/** The places a distributor stands for, or the places an employee works in — each id stands for everything under it. */
export interface CoverageScope {
  zoneIds: string[];
  hqIds: string[];
  routeIds: string[];
}

/**
 * A distributor serving any number of Zones, HQs and Routes (client rules §17.2), handed to any number of field employees of any
 * designation (decision-log 2026-10-09). Each of `zoneIds`, `hqIds` and `routeIds` stands for everything under it — a Zone alone is all
 * its HQs and so all their Routes; an HQ alone is all its Routes — the same rule employees' coverage follows. Orders, payments and
 * monthly stock against it belong to Sales & Orders.
 */
export interface Distributor {
  id: string;
  zoneIds: string[];
  hqIds: string[];
  routeIds: string[];
  name: string;
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  address: string;
  location: GeoPoint | null;
  assignedUserIds: string[];
  documents: DistributorDocument[];
  /** What the distributor already owed before this system (whole paise): the starting point of their dues. */
  openingDuesPaise: number;
  status: MasterStatus;
}
