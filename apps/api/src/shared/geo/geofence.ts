import type { GeofenceComputedStatus, GeofenceReason, GeofenceResult, GeoPoint } from '@greynote/contracts';

export type { GeofenceComputedStatus, GeofenceReason, GeofenceResult, GeoPoint };

const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points, in meters (haversine). Accurate to well under a meter at field-visit distances. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** `OVERRIDE` (a manager accepting a `FAIL`) is recorded by Field Activity's DCR review, never computed here. */
export type GeofenceStatus = GeofenceComputedStatus;

export interface GeofenceInput {
  /** Where the Doctor or Chemist is supposed to be; `null` if none was ever registered. */
  registered: GeoPoint | null;
  /** The phone's GPS at the call. */
  captured: GeoPoint;
  /** The phone's reported accuracy radius for that reading, in meters; `null` if it didn't say. */
  accuracyMeters: number | null;
  radiusMeters: number;
  /** A reading less accurate than this is not evidence either way. */
  maxAccuracyMeters: number;
}

/**
 * The call-location check (PRD §5.1, HLD 01 §2). It **flags, it doesn't block**. Run on the device
 * first from the cached location; the server runs it again at sync from the canonical one and
 * overwrites (the server's answer is authoritative). Pure: the radius and the accuracy limit are
 * SystemConfig values the caller passes in.
 *
 * A registered location missing → `UNVERIFIED`, whatever the reading. Otherwise a reading worse than
 * `maxAccuracyMeters` → `UNVERIFIED` (a nearby-looking point from a weak fix proves nothing, and a
 * far-looking one may just be drift) — the distance is still reported so a manager can judge.
 * A reading with no accuracy given is taken at face value.
 */
export function evaluateGeofence(input: GeofenceInput): GeofenceResult {
  if (input.registered === null) return { status: 'UNVERIFIED', distanceMeters: null, reason: 'NO_REGISTERED_LOCATION' };
  const distanceMeters = Math.round(haversineMeters(input.registered, input.captured));
  if (input.accuracyMeters !== null && input.accuracyMeters > input.maxAccuracyMeters) {
    return { status: 'UNVERIFIED', distanceMeters, reason: 'LOW_ACCURACY' };
  }
  return { status: distanceMeters <= input.radiusMeters ? 'PASS' : 'FAIL', distanceMeters, reason: null };
}
