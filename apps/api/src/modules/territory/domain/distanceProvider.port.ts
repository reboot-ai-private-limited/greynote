export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export type DistanceResult = { ok: true; meters: number } | { ok: false; reason: string };

/**
 * Road distance (not straight-line) through `points` in exactly the given order — the provider
 * must never re-optimize the sequence (HLD 02 §2). Never throws: a provider outage is a `FAILED`
 * route, not a failed save.
 */
export interface DistanceProviderPort {
  roadDistance(points: GeoPoint[]): Promise<DistanceResult>;
}
