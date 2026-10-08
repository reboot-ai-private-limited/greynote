import { evaluateGeofence, type GeofenceResult } from './geofence';
import { createRecord, updateRecord } from './outbox';
import { getNumberSetting } from './settings';
import type { OutboxRecord, SyncKind } from './types';
import type { GpsFix } from '@/lib/location';
import type { GeoPoint } from '@/types/sync';

/** The day's records the Dr/Chemist screens keep: calls and follow-ups (HLD 01 §1.2). */
export type CallKind = Extract<SyncKind, 'DOCTOR_CALL' | 'CHEMIST_CALL'>;
export type FollowupKind = Extract<SyncKind, 'DOCTOR_FOLLOWUP' | 'CHEMIST_FOLLOWUP'>;

export type WorkingTypeValue = 'FIELD_WORK' | 'MEETING' | 'CONFERENCE' | 'STRIKE';

/** Exactly what the server's DOCTOR_CALL / CHEMIST_CALL handlers take (packages/contracts sync.ts). */
export type CallPayload = {
  reportDate: string;
  doctorId?: string;
  chemistId?: string;
  workingType: WorkingTypeValue;
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
  /** The phone's GPS at the time — required, and becomes the registered location until Admin corrects it. */
  location: GeoPoint;
};

export type FollowupPayload = { reportDate: string; doctorId?: string; chemistId?: string; remarks: string };

/** The phone's own geofence answer for a call. The server recomputes it at Submit and its answer wins. */
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
