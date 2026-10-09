import type { GeoPoint, MasterStatus } from './masterStatus.js';

/**
 * A distributor on one or more Routes of a single Zone (client rules §17.2; Zone/HQ are reached through
 * the Routes, never stored), handed to any number of field employees of any designation (decision-log
 * 2026-10-09, which replaces the one-MR-one-ASM rule of sign-off C2). Orders, payments and monthly stock
 * against it belong to Sales & Orders.
 */
export interface Distributor {
  id: string;
  routeIds: string[];
  name: string;
  gstNumber: string;
  contactPerson: string;
  mobile: string;
  address: string;
  location: GeoPoint | null;
  assignedUserIds: string[];
  status: MasterStatus;
}
