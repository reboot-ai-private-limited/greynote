/**
 * Pure planning for `migrate-outlet-places.ts` (decision-log 2026-11-26, phase 3): doctors, chemists and distributors move from routes to
 * places. A doctor or chemist takes its route's To place (its `routeId` stays, as the route it is reached by). A distributor's routes become
 * the To places of those routes. A record whose route has no places (a deleted route, or one `migrate:places` has not reached) is reported
 * and left alone. Records that already have a place are left alone, so it is safe to repeat.
 */
export interface MigRouteEnds {
  _id: unknown;
  toPlaceId?: unknown;
}
export interface MigOnRoute {
  _id: unknown;
  name: string;
  routeId: unknown;
  placeId?: unknown;
}
export interface MigDistributor {
  _id: unknown;
  name: string;
  routeIds?: unknown[] | undefined;
  placeIds?: unknown[] | undefined;
}

export function planOutletPlaces(input: { routes: MigRouteEnds[]; doctors: MigOnRoute[]; chemists: MigOnRoute[]; distributors: MigDistributor[] }): {
  doctors: Array<{ id: unknown; placeId: string }>;
  chemists: Array<{ id: unknown; placeId: string }>;
  distributors: Array<{ id: unknown; placeIds: string[] }>;
  /** "Doctor X", … whose route has no place: they need a place set by hand. */
  unplaced: string[];
} {
  const toPlace = new Map(input.routes.filter((r) => r.toPlaceId).map((r) => [String(r._id), String(r.toPlaceId)]));
  const unplaced: string[] = [];
  const onRoute = (rows: MigOnRoute[], noun: string) =>
    rows.flatMap((r) => {
      if (r.placeId) return [];
      const placeId = toPlace.get(String(r.routeId));
      if (!placeId) {
        unplaced.push(`${noun} "${r.name}" (${String(r._id)})`);
        return [];
      }
      return [{ id: r._id, placeId }];
    });
  const doctors = onRoute(input.doctors, 'Doctor');
  const chemists = onRoute(input.chemists, 'Chemist');
  const distributors = input.distributors.flatMap((d) => {
    const routeIds = (d.routeIds ?? []).map(String);
    if (routeIds.length === 0) return [];
    const found = routeIds.map((id) => toPlace.get(id));
    if (found.some((p) => !p)) unplaced.push(`Distributor "${d.name}" (${String(d._id)}): some routes have no place`);
    const placeIds = [...new Set([...(d.placeIds ?? []).map(String), ...found.filter((p): p is string => !!p)])];
    return [{ id: d._id, placeIds }];
  });
  return { doctors, chemists, distributors, unplaced };
}
