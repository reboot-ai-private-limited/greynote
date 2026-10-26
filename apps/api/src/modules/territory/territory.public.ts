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
  /** Every HQ id under a Zone — a Zone that names none of its HQs stands for all of them. */
  listHqIdsInZone(zoneId: string): Promise<string[]>;
  /** A FIELD employee's current HQ and its Zone, or `null` if none is set — HR's holiday scope. */
  getUserHq(userId: string): Promise<{ hqId: string; zoneId: string } | null>;
  /** Every HQ and Zone the employee covers (a covered Zone brings its HQs, a covered HQ its Zone), or `null` for none: what HR's holidays follow. */
  getUserTerritory(userId: string): Promise<{ hqIds: string[]; zoneIds: string[] } | null>;
  /** Sets the Zones and HQs a FIELD employee covers (and their main HQ) — the employee wizard's last step. */
  assignUserCoverage(userId: string, input: { hqIds: string[]; zoneIds: string[] }, actorId: string): Promise<void>;
  /** Sets a FIELD employee's HQ (ends the previous one) — the employee wizard's last step. */
  assignUserHq(userId: string, hqId: string, actorId: string): Promise<unknown>;
  /** Gives a FIELD employee these routes (ones they already hold are skipped) — the employee wizard's last step. */
  assignUserRoutes(userId: string, routeIds: string[], actorId: string): Promise<void>;
  /** What a leaving employee holds: active routes, and HQs/Zones covered beyond their main HQ. */
  countUserHoldings(userId: string): Promise<{ routes: number; coverage: number }>;
  /**
   * A leaving employee (decision-log 2026-10-22): every route assignment ends (kept as history) and the covered HQs and Zones are
   * cleared. Their main HQ stays on record, as where they were based. Safe to run again.
   */
  releaseUserHoldings(userId: string, actorId: string): Promise<{ routes: number; coverage: number }>;
  getHq(hqId: string): Promise<{ id: string; zoneId: string; name: string; status: TerritoryStatus } | null>;
  getZone(zoneId: string): Promise<{ id: string; name: string; status: TerritoryStatus } | null>;
  /** Case-insensitive name lookups — for files that name places (HR's holiday import). */
  findZoneByName(name: string): Promise<{ id: string; name: string; status: TerritoryStatus } | null>;
  findHqByName(zoneId: string, name: string): Promise<{ id: string; zoneId: string; name: string; status: TerritoryStatus } | null>;
}
