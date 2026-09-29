import type { GeoPoint } from './masterStatus.js';

/** `pending` (an MR-added Doctor awaiting approval) joins this list with the approval step. */
export const DOCTOR_STATUSES = ['active', 'inactive'] as const;
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
  status: DoctorStatus;
  /** The Admin (or, later, MR) who added it. */
  addedBy: string;
  /** When it became usable; Phase 6's coverage wait counts from here. */
  approvedAt: Date | null;
}
