import { evaluateGeofence, type GeofenceResult } from './geofence';
import { createRecord, updateRecord } from './outbox';
import { getNumberSetting } from './settings';
import type { OutboxRecord, SyncKind } from './types';
import type { GpsFix } from '@/lib/location';
import type { GeoPoint } from '@/types/sync';

/** The day's records the Dr/Chemist screens keep: calls and follow-ups (HLD 01 §1.2). */
export type CallKind = Extract<SyncKind, 'DOCTOR_CALL' | 'CHEMIST_CALL'>;
export type FollowupKind = Extract<SyncKind, 'DOCTOR_FOLLOWUP' | 'CHEMIST_FOLLOWUP'>;

/**
 * Exactly what the server's DOCTOR_CALL / CHEMIST_CALL handlers take (packages/contracts sync.ts). The work type is not
 * sent: the server stamps the day's plan type and the doctor's or chemist's route type. A location is required — the
 * server refuses a call away from the doctor or chemist (`NOT_AT_LOCATION`) and stores nothing.
 */
export type CallPayload = {
  reportDate: string;
  doctorId?: string;
  chemistId?: string;
  workWith: string[];
  remarks: string | null;
  capturedLocation: GeoPoint | null;
  accuracyMeters: number | null;
  samples?: { productId: string; quantity: number }[];
};

export type ExpenseType = 'TRAVEL' | 'MEAL' | 'MISC';
/** Whole paise above zero; TA and DA are never sent — the server computes them. */
export type ExpensePayload = { reportDate: string; type: ExpenseType; amountPaise: number; remarks: string | null };

/** A doctor the MR met who is not on their list: the server creates it pending and sends it for approval. */
export type NewDoctorPayload = {
  routeId: string;
  name: string;
  address: string;
  specialty: string;
  qualification: string;
  email: string | null;
  /** Optional: the clinic or hospital (≤ 150), and a phone number of 10–15 digits with an optional leading `+`. */
  clinicName?: string | null;
  phone?: string | null;
  /** Optional: `YYYY-MM-DD` dates, and visits a month (1–4) the MR should make to this doctor. */
  dateOfBirth?: string | null;
  anniversary?: string | null;
  visitFrequency?: number | null;
  /** The phone's GPS at the time — required, and becomes the registered location until Admin corrects it. */
  location: GeoPoint;
};

/** A follow-up: the same location rule as a call (packages/contracts `DoctorFollowupPayload` / `ChemistFollowupPayload`). */
export type FollowupPayload = {
  reportDate: string;
  doctorId?: string;
  chemistId?: string;
  remarks: string;
  capturedLocation: GeoPoint | null;
  accuracyMeters: number | null;
};

/**
 * The phone's own geofence answer for a call or follow-up, used to block Save before the record is kept. The server checks
 * again at Submit and its answer wins: anything but a PASS there is refused (`NOT_AT_LOCATION`).
 */
export async function localGeofence(registered: GeoPoint | null, fix: GpsFix | null): Promise<GeofenceResult> {
  const [radiusMeters, maxAccuracyMeters] = await Promise.all([
    getNumberSetting('GEO_FENCE_RADIUS_METERS'),
    getNumberSetting('GEO_MAX_ACCURACY_METERS'),
  ]);
  return evaluateGeofence({
    registered,
    captured: fix?.point ?? null,
    accuracyMeters: fix?.accuracyMeters ?? null,
    radiusMeters,
    maxAccuracyMeters,
  });
}

/**
 * Why the phone won't keep a call or follow-up here, or `null` when it may (docs/mobile/dcr.md rules 2–3): no GPS, a weak
 * reading, no registered location, or farther than `GEO_FENCE_RADIUS_METERS`. The same message the server's
 * `NOT_AT_LOCATION` gives, so the employee goes to the place and adds it there.
 */
export async function notAtLocationReason(registered: GeoPoint | null, fix: GpsFix | null, noun: 'doctor' | 'chemist'): Promise<string | null> {
  const [result, radius, maxAccuracy] = await Promise.all([
    localGeofence(registered, fix),
    getNumberSetting('GEO_FENCE_RADIUS_METERS'),
    getNumberSetting('GEO_MAX_ACCURACY_METERS'),
  ]);
  if (result.status === 'PASS') return null;
  if (result.reason === 'NO_REGISTERED_LOCATION') return `This ${noun} has no registered location yet. Ask Admin to set it, then add the record.`;
  if (result.reason === 'NO_GPS_READING') return 'Couldn’t get your location. Turn on location (GPS) and try again.';
  if (result.reason === 'LOW_ACCURACY') return `Your GPS is too weak right now (needs ±${maxAccuracy} m or better). Move into the open and try again.`;
  return `You are not at the ${noun}’s location (${result.distanceMeters} m away, the limit is ${radius} m).`;
}

/** Keeps a call (or follow-up) as a DRAFT of the day. It joins the report at Final Submission, which is what talks to the server. */
export const saveCall = (
  kind: CallKind | FollowupKind | 'EXPENSE' | 'NEW_DOCTOR',
  payload: CallPayload | FollowupPayload | ExpensePayload | NewDoctorPayload,
  existing?: OutboxRecord,
) =>
  existing ? updateRecord(existing.clientId, payload) : createRecord(kind, payload);

export const payloadOf = <T,>(record: OutboxRecord) => record.payload as T;

/** The geofence result to show for a record: the server's once synced, otherwise unknown here (see `localGeofence`). */
export const serverGeofence = (record: OutboxRecord): GeofenceResult | null =>
  (record.serverData as { geofence?: GeofenceResult } | null)?.geofence ?? null;
