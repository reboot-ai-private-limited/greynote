import type { RoutePath, RouteSummary } from './domain/routeView.js';
import type { TerritoryStatus } from './domain/territoryStatus.js';

export type { RoutePath, RouteSummary } from './domain/routeView.js';

/** The only thing another module may import from `territory/`. */
export interface TerritoryPublicContract {
  /**
   * A Route's TA/DA inputs, or `null` for an unknown id. `distanceKm` is null exactly when
   * `distanceStatus` is `FAILED`: TA must flag that day, never compute it as 0 km (HLD 02 §4).
   * Use `distanceKm` as-is — it is never doubled for a return trip (sign-off D7).
   */
  getRoute(routeId: string): Promise<RouteSummary | null>;
  /** The active Routes an employee currently covers — what a Daily Plan may choose from. */
  listRoutesForUser(userId: string): Promise<RouteSummary[]>;
  /** The Route's Area / HQ / Zone ids and Area type, or `null` for an unknown id. */
  getRoutePath(routeId: string): Promise<RoutePath | null>;
  /** A FIELD employee's current HQ and its Zone, or `null` if none is set — HR's holiday scope. */
  getUserHq(userId: string): Promise<{ hqId: string; zoneId: string } | null>;
  getHq(hqId: string): Promise<{ id: string; zoneId: string; name: string; status: TerritoryStatus } | null>;
  getZone(zoneId: string): Promise<{ id: string; name: string; status: TerritoryStatus } | null>;
}
