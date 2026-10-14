import type { RoutePath, RouteSummary } from './domain/routeView.js';
import type { TerritoryStatus } from './domain/territoryStatus.js';

export type { RoutePath, RouteSummary } from './domain/routeView.js';

/** The only thing another module may import from `territory/`. */
export interface TerritoryPublicContract {
  /**
   * A Route's TA/DA inputs, or `null` for an unknown id. `distanceKm` is null exactly when
   * `distanceStatus` is `FAILED` (a Route with no km typed yet): TA must flag that day, never compute it as 0 km (HLD 02 §4).
   * Use `distanceKm` as-is — it is never doubled for a return trip (sign-off D7).
   */
  getRoute(routeId: string): Promise<RouteSummary | null>;
  /** The active Routes an employee currently covers — what a Daily Plan may choose from. */
  listRoutesForUser(userId: string): Promise<RouteSummary[]>;
  /** The Route's HQ and Zone ids and its type, or `null` for an unknown id. */
  getRoutePath(routeId: string): Promise<RoutePath | null>;
  /** Every Route id under an HQ or a Zone (the most specific one given) — for filtering lists by territory. */
  listRouteIdsInScope(scope: { hqId?: string | undefined; zoneId?: string | undefined }): Promise<string[]>;
  /** A FIELD employee's current HQ and its Zone, or `null` if none is set — HR's holiday scope. */
  getUserHq(userId: string): Promise<{ hqId: string; zoneId: string } | null>;
  /** Sets a FIELD employee's HQ (ends the previous one) — the employee wizard's last step. */
  assignUserHq(userId: string, hqId: string, actorId: string): Promise<unknown>;
  getHq(hqId: string): Promise<{ id: string; zoneId: string; name: string; status: TerritoryStatus } | null>;
  getZone(zoneId: string): Promise<{ id: string; name: string; status: TerritoryStatus } | null>;
  /** Case-insensitive name lookups — for files that name places (HR's holiday import). */
  findZoneByName(name: string): Promise<{ id: string; name: string; status: TerritoryStatus } | null>;
  findHqByName(zoneId: string, name: string): Promise<{ id: string; zoneId: string; name: string; status: TerritoryStatus } | null>;
}
