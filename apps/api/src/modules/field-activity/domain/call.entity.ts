import type { GeofenceComputedStatus, GeofenceReason, GeoPoint, WorkingType } from '@greynote/contracts';

/**
 * The server's geofence answer for a call (`sync.md`, *Geofencing*), computed at sync from the Doctor's or
 * Chemist's stored location and the config radius — the phone's own is only a UX hint and is overwritten.
 * `OVERRIDE` is a manager accepting a `FAIL` / `UNVERIFIED` in their DCR review; when it is, the computed
 * distance and reason are kept beside who, when and why.
 */
export interface GeofenceOutcome {
  status: GeofenceComputedStatus | 'OVERRIDE';
  distanceMeters: number | null;
  reason: GeofenceReason | null;
  overriddenBy: string | null;
  overriddenAt: Date | null;
  overrideComment: string | null;
}

/** One line of samples given: it drew `quantity` down from this allocation, in the call's transaction. */
export interface SampleLine {
  allocationId: string;
  productId: string;
  quantity: number;
}

interface CallBase {
  id: string;
  dcrId: string;
  userId: string;
  reportDate: string;
  workingType: WorkingType;
  /** Accompanying colleagues' user ids. */
  workWith: string[];
  remarks: string | null;
  capturedLocation: GeoPoint | null;
  accuracyMeters: number | null;
  geofence: GeofenceOutcome;
  /** The phone's id for it — the sync client id. */
  clientId: string;
  /** When the MR made it on the phone. */
  recordedAt: Date;
}

export interface DoctorCall extends CallBase {
  doctorId: string;
  samples: SampleLine[];
}

export interface ChemistCall extends CallBase {
  chemistId: string;
}

/** A follow-up note on a Doctor or a Chemist, attached to the day's DCR. */
export interface Followup {
  id: string;
  dcrId: string;
  userId: string;
  reportDate: string;
  subject: 'DOCTOR' | 'CHEMIST';
  /** The Doctor's or Chemist's id. */
  subjectId: string;
  remarks: string;
  clientId: string;
  recordedAt: Date;
}
