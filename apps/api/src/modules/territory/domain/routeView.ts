import type { Route, RouteType } from './route.entity.js';

/**
 * What other modules see of a Route (via `TerritoryPublicContract`) and what an MR's route
 * picker shows: the TA inputs plus the type that decides DA — no coordinates.
 */
export interface RouteSummary {
  id: string;
  name: string;
  hqId: string;
  hqName: string;
  /** Decides the DA rate for a day on this route (HLD 06 §2). */
  routeType: RouteType;
  /** Null when `distanceStatus` is `FAILED` — TA must flag that, never read it as 0 km. */
  distanceKm: string | null;
  distanceStatus: Route['distanceStatus'];
  taPerKmRateOverridePaise: number | null;
  status: Route['status'];
}

/** A Route's place in Zone → HQ → Route, for breadcrumbs and DA. */
export interface RoutePath {
  routeId: string;
  routeType: RouteType;
  hqId: string;
  zoneId: string;
}
