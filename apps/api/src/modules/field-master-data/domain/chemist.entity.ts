import type { GeoPoint, MasterStatus } from './masterStatus.js';

/** A pharmacy on a Route. Its registered location is what a Chemist Call's geofence check compares against. */
export interface Chemist {
  id: string;
  routeId: string;
  name: string;
  address: string;
  /** `null` until a location is set — the geofence check can't run for it. */
  location: GeoPoint | null;
  status: MasterStatus;
}
