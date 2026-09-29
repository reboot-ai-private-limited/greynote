import type { GeoPoint } from './masterStatus.js';

/**
 * `pending` is an MR-added Doctor that hasn't been approved: every other module treats it as not
 * existing yet (LLD field-master-data.md, Doctor-creation approval).
 */
export const DOCTOR_STATUSES = ['pending', 'active', 'inactive'] as const;
export type DoctorStatus = (typeof DOCTOR_STATUSES)[number];

/**
 * A doctor on one Route (the clinic's place). Who is responsible for the doctor is a
 * `DoctorAssignment`, deliberately separate from the Route.
 */
export interface Doctor {
  id: string;
  routeId: string;
  category: string;
  name: string;
  address: string;
  email: string | null;
  specialty: string;
  qualification: string;
  /** `null` until set — the geofence check can't run for it. */
  location: GeoPoint | null;
  /** The MR phone's GPS when they added the Doctor; kept when Admin corrects `location`. `null` for Admin-added. */
  capturedLocation: GeoPoint | null;
  status: DoctorStatus;
  /** The Admin (or, later, MR) who added it. */
  addedBy: string;
  /** The MR app's id for the create, so a retry after a dropped connection can't add it twice. `null` for Admin-added. */
  clientRequestId: string | null;
  /** When it became usable; Phase 6's coverage wait counts from here. */
  approvedAt: Date | null;
}
