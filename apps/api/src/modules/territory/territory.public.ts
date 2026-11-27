import type { RoutePath, RouteSummary } from './domain/routeView.js';
import type { TerritoryStatus } from './domain/territoryStatus.js';

export type { RoutePath, RouteSummary } from './domain/routeView.js';

/** What other modules see of a Place. */
export interface PlaceSummary {
  id: string;
  hqId: string;
  name: string;
  type: 'HQ' | 'EX_STATION' | 'OUT_STATION';
  isHqTown: boolean;
  status: TerritoryStatus;
  /** Filled by `listPlacesForUsers`, for a picker that groups by HQ. */
  hqName?: string;
}

/** The only thing another module may import from `territory/`. */
export interface TerritoryPublicContract {
  /**
   * A Route's TA/DA inputs, or `null` for an unknown id. `distanceKm` is null exactly when
   * `distanceStatus` is `FAILED` (a Route with no km typed yet): TA must flag that day, never compute it as 0 km (HLD 02 §4).
   * Use `distanceKm` as-is — it is never doubled for a return trip (sign-off D7).
   */
  getRoute(routeId: string): Promise<RouteSummary | null>;
  /** Many routes at once (2026-11-27): live ones in two queries, deleted ones from the archive. Unknown ids are left out. */
  getRoutes(routeIds: string[]): Promise<RouteSummary[]>;
  /** The active Routes an employee currently covers — what a Daily Plan may choose from. */
  listRoutesForUser(userId: string): Promise<RouteSummary[]>;
  /** The active Routes held by any of these employees, each once, in one query (a manager's whole downline). */
  listRoutesForUsers(userIds: string[]): Promise<RouteSummary[]>;
  /** Who holds each of these routes now, as `{ routeId, userId }` pairs, in one query. */
  listHoldersOfRoutes(routeIds: string[]): Promise<Array<{ routeId: string; userId: string }>>;
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
  /** A place (decision-log 2026-11-26), or `null` for an unknown id. */
  getPlace(placeId: string): Promise<PlaceSummary | null>;
  /** Several places at once; an unknown id is left out. */
  getPlaces(placeIds: string[]): Promise<PlaceSummary[]>;
  /** The active places of the HQ an employee is based in: where their doctors, chemists and distributors may sit. Empty with no HQ. */
  listPlacesForUser(userId: string): Promise<PlaceSummary[]>;
  /** `listPlacesForUser` for many people at once (2026-11-27): each person's places, one read per HQ. */
  listPlacesByUser(userIds: string[]): Promise<Array<{ userId: string; places: PlaceSummary[] }>>;
  /** The active places of the HQs these employees are based in, each once: what a manager's Tour Plan may visit (own HQ + the team's). */
  listPlacesForUsers(userIds: string[]): Promise<PlaceSummary[]>;
  /** The route between two places, whichever way it was typed, or `null` (2026-11-26: a Tour Plan day may only go along a typed route). */
  findRouteBetween(placeA: string, placeB: string): Promise<RouteSummary | null>;
  /** Every place id under an HQ or a Zone (the most specific one given), any status: for filtering lists by territory. */
  listPlaceIdsInScope(scope: { hqId?: string | undefined; zoneId?: string | undefined }): Promise<string[]>;
  /**
   * The route a record on this place keeps as its `routeId` until everything reads places (phase 4): the active route between the place
   * and its HQ town (for the HQ town itself, town ↔ town), else any active route touching it. `null` when the place has no active route.
   */
  anchorRouteForPlace(placeId: string): Promise<string | null>;
  getHq(hqId: string): Promise<{ id: string; zoneId: string; name: string; status: TerritoryStatus } | null>;
  getZone(zoneId: string): Promise<{ id: string; name: string; status: TerritoryStatus } | null>;
  /** Case-insensitive name lookups — for files that name places (HR's holiday import). */
  findZoneByName(name: string): Promise<{ id: string; name: string; status: TerritoryStatus } | null>;
  findHqByName(zoneId: string, name: string): Promise<{ id: string; zoneId: string; name: string; status: TerritoryStatus } | null>;
}
