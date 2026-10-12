import type { GeofenceComputedStatus, GeofenceReason, GeoPoint, WorkingType } from '@greynote/contracts';

/** The kind of Route a record was made on (Territory's `Route.type`), shown beside the work type: HQ, Ex-station or Out-station. */
export type RecordRouteType = 'HQ' | 'EX_STATION' | 'OUT_STATION';

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
  /** The day's plan type, stamped by the server — the phone does not send it. */
  workingType: WorkingType;
  /** The Doctor's or Chemist's Route and its type, stamped by the server. */
  routeId: string | null;
  routeType: RecordRouteType | null;
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
  /** The day's approved plan lists doctors and this one wasn't among them: allowed by `ALLOW_UNPLANNED_DOCTOR_CALLS`, shown as "Not in plan". */
  notInPlan: boolean;
  /** The Doctor's Route isn't one the day's plan lists (a flag, never a refusal). */
  routeNotInPlan: boolean;
}

export interface ChemistCall extends CallBase {
  chemistId: string;
  /** The Chemist's Route isn't one the day's plan lists (a flag, never a refusal). */
  routeNotInPlan: boolean;
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
  /** `null` on follow-ups from before work type, route type and GPS were recorded on them. */
  workingType: WorkingType | null;
  routeId: string | null;
  routeType: RecordRouteType | null;
  /** A Doctor not on the day's list, or a Chemist whose Route the plan doesn't list: flagged for the report. */
  notInPlan: boolean;
  capturedLocation: GeoPoint | null;
  accuracyMeters: number | null;
  /** `null` on legacy follow-ups; every new one passed the geofence. */
  geofence: GeofenceOutcome | null;
  clientId: string;
  recordedAt: Date;
}
