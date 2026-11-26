/** Planning's narrow view of Territory; `territory.contract` satisfies it structurally. */
export interface RouteDirectoryPort {
  /** The active Routes an employee currently covers — what a Plan may name. */
  listRoutesForUser(userId: string): Promise<Array<{ id: string; routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION' }>>;
  /** The active Routes held by any of these employees, each once, in one query — a manager's plan may name the routes of everyone below them. */
  listRoutesForUsers(userIds: string[]): Promise<
    Array<{ id: string; name: string; hqId: string; hqName: string; routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION'; fromPlaceId?: string | null; toPlaceId?: string | null; distanceKm?: string | null }>
  >;
  /** Who holds each of these routes now (`{ routeId, userId }` pairs), in one query. */
  listHoldersOfRoutes(routeIds: string[]): Promise<Array<{ routeId: string; userId: string }>>;
  /** Any route by id, its name and type, or `null` for an unknown id (a deleted route still answers): what a plan's reader is shown. */
  getRoute(routeId: string): Promise<PlanRoute | null>;
  /** The route between two places, whichever way it was typed, or `null` (2026-11-26). */
  findRouteBetween(placeA: string, placeB: string): Promise<(PlanRoute & { status: 'active' | 'inactive' }) | null>;
  /** The active places of the HQs these employees are based in: where a plan (theirs, or a manager's with them as the team) may go. */
  listPlacesForUsers(userIds: string[]): Promise<PlanPlace[]>;
  /** The route a place is reached by (to its HQ town), or `null`: who "holds" a day spent at one place is who holds this. */
  anchorRouteForPlace?(placeId: string): Promise<string | null>;
}

/** A place a plan may go to. */
export interface PlanPlace {
  id: string;
  hqId: string;
  name: string;
  type: 'HQ' | 'EX_STATION' | 'OUT_STATION';
  isHqTown: boolean;
  hqName?: string;
}

/** A route a plan names, as its reader sees it: the type says HQ, ex-station or out-station. */
export interface PlanRoute {
  id: string;
  name: string;
  routeType: 'HQ' | 'EX_STATION' | 'OUT_STATION';
  /** The route's two places; null on one not yet migrated. Absent from older fakes. */
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  distanceKm?: string | null;
}
