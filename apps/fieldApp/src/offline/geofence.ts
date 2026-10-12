/**
 * The call-location check, run on the phone first (HLD 01 §2.2) from the cached Doctor/Chemist
 * location. A port of apps/api/src/shared/geo/geofence.ts — keep the two in step. The server
 * recomputes at sync and its answer wins. Only a `PASS` is accepted: anything else is refused (`NOT_AT_LOCATION`) and
 * nothing is stored, so the phone blocks Save on the same answer (docs/mobile/dcr.md rule 2).
 */

export type GeoPoint = { latitude: number; longitude: number };
export type GeofenceStatus = 'PASS' | 'FAIL' | 'UNVERIFIED';
export type GeofenceReason = 'NO_REGISTERED_LOCATION' | 'NO_GPS_READING' | 'LOW_ACCURACY';
export type GeofenceResult = {
  status: GeofenceStatus;
  distanceMeters: number | null;
  reason: GeofenceReason | null;
};

export type GeofenceInput = {
  /** Where the Doctor or Chemist is registered; null if never set. */
  registered: GeoPoint | null;
  /** The phone's GPS fix at the call; null if it couldn't get one. */
  captured: GeoPoint | null;
  /** The fix's reported accuracy radius in meters; null if the phone didn't say. */
  accuracyMeters: number | null;
  radiusMeters: number;
  /** A fix less accurate than this is not evidence either way. */
  maxAccuracyMeters: number;
};

const EARTH_RADIUS_METERS = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function evaluateGeofence(input: GeofenceInput): GeofenceResult {
  if (input.registered === null) {
    return { status: 'UNVERIFIED', distanceMeters: null, reason: 'NO_REGISTERED_LOCATION' };
  }
  if (input.captured === null) {
    return { status: 'UNVERIFIED', distanceMeters: null, reason: 'NO_GPS_READING' };
  }
  const distanceMeters = Math.round(haversineMeters(input.registered, input.captured));
  if (input.accuracyMeters !== null && input.accuracyMeters > input.maxAccuracyMeters) {
    return { status: 'UNVERIFIED', distanceMeters, reason: 'LOW_ACCURACY' };
  }
  return { status: distanceMeters <= input.radiusMeters ? 'PASS' : 'FAIL', distanceMeters, reason: null };
}
