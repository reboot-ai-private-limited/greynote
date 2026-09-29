/**
 * The call-location check's vocabulary (docs/LLD/sync.md, Geofencing), shared by `apps/api` and the phone
 * — which computes it first, offline, and then takes the server's recomputed answer (sign-off G10).
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** What the distance check itself can answer. It **flags, it doesn't block**. */
export const GEOFENCE_COMPUTED_STATUSES = ['PASS', 'FAIL', 'UNVERIFIED'] as const;
export type GeofenceComputedStatus = (typeof GEOFENCE_COMPUTED_STATUSES)[number];

/** `OVERRIDE` is a manager accepting a `FAIL` in their DCR review — recorded, never computed. */
export const GEOFENCE_STATUSES = [...GEOFENCE_COMPUTED_STATUSES, 'OVERRIDE'] as const;
export type GeofenceStatus = (typeof GEOFENCE_STATUSES)[number];

/** Why a check is `UNVERIFIED`: the Doctor or Chemist has no registered location, or the GPS reading was too weak. */
export const GEOFENCE_REASONS = ['NO_REGISTERED_LOCATION', 'LOW_ACCURACY'] as const;
export type GeofenceReason = (typeof GEOFENCE_REASONS)[number];

export interface GeofenceResult {
  status: GeofenceComputedStatus;
  /** Meters from the registered point, rounded; `null` when there is nothing to measure against. */
  distanceMeters: number | null;
  reason: GeofenceReason | null;
}
