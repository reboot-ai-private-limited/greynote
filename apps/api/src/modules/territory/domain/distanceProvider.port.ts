export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export type DistanceResult = { ok: true; meters: number } | { ok: false; reason: string };

/**
 * Road distance (not straight-line) from the first point to the last. A Route passes exactly two:
 * its HQ's base place and its destination (HLD 02 §2). Never throws: a provider outage is a
 * `FAILED` route, not a failed save.
 */
export interface DistanceProviderPort {
  roadDistance(points: GeoPoint[]): Promise<DistanceResult>;
}
