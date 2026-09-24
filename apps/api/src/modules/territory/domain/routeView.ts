import type { AreaType } from './area.entity.js';
import type { Route } from './route.entity.js';

/**
 * What other modules see of a Route (via `TerritoryPublicContract`) and what an MR's route
 * picker shows: the TA inputs plus the Area type that decides DA — no waypoints.
 */
export interface RouteSummary {
  id: string;
  name: string;
  areaId: string;
  areaName: string;
  /** Decides the DA rate for a day on this route (HLD 06 §2). */
  areaType: AreaType;
  /** Null when `distanceStatus` is `FAILED` — TA must flag that, never read it as 0 km. */
  distanceKm: string | null;
  distanceStatus: Route['distanceStatus'];
  taPerKmRateOverride: string | null;
  status: Route['status'];
}

/** A Route's place in Zone → HQ → Area → Route, for breadcrumbs and DA. */
export interface RoutePath {
  routeId: string;
  areaId: string;
  areaType: AreaType;
  hqId: string;
  zoneId: string;
}
