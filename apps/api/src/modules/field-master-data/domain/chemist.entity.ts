import type { GeoPoint } from './masterStatus.js';

/**
 * `pending` is an MR-added Chemist that hasn't been approved: every other module treats it as not
 * existing yet (the same rule as a pending Doctor).
 */
export const CHEMIST_STATUSES = ['pending', 'active', 'inactive'] as const;
export type ChemistStatus = (typeof CHEMIST_STATUSES)[number];

/** A pharmacy on a Route. Its registered location is what a Chemist Call's geofence check compares against. */
export interface Chemist {
  id: string;
  routeId: string;
  name: string;
  address: string;
  /** `null` until a location is set — the geofence check can't run for it. */
  location: GeoPoint | null;
  /** The MR phone's GPS when they added the Chemist; kept when Admin corrects `location`. `null` for Admin-added. */
  capturedLocation: GeoPoint | null;
  status: ChemistStatus;
  /** The employee who added it; `null` for a Chemist Admin added (or added before MRs could). */
  addedBy: string | null;
  /** The app's id for the create, so a retry after a dropped connection can't add it twice. `null` for Admin-added. */
  clientRequestId: string | null;
  /** When it became usable; `null` until approved (and for Admin-added). */
  approvedAt: Date | null;
}
