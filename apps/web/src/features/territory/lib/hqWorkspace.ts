import type { PlaceDto, RouteDto } from '@greynote/contracts';

/** One place of the HQ as the Territory page lists it, with the route that joins it to the HQ town (null: none yet). */
export interface HqPlaceRow {
  place: PlaceDto;
  /** The HQ town itself has none to show. */
  townRoute: RouteDto | null;
}

export interface HqWorkspaceView {
  town: PlaceDto | null;
  /** The HQ town first, then the rest by name; inactive places last. */
  places: HqPlaceRow[];
  /** Every other route touching the HQ: place ↔ place inside it, and routes to or from other HQs. By name. */
  otherRoutes: RouteDto[];
  counts: { places: number; routes: number; missing: number };
}

const isPair = (r: RouteDto, a: string, b: string) => (r.fromPlaceId === a && r.toPlaceId === b) || (r.fromPlaceId === b && r.toPlaceId === a);

/**
 * The chosen HQ on the Territory page (2026-11-27): its places with each one's HQ-town route, and the routes that aren't such a route. A
 * route from before places (no ends) counts with the other routes. `missing` counts active places (not the town) with no active route
 * to the town: what still needs a km.
 */
export function buildHqWorkspace(places: readonly PlaceDto[], routes: readonly RouteDto[]): HqWorkspaceView {
  const town = places.find((p) => p.isHqTown) ?? null;
  const townRoutes = new Set<string>();
  const rows: HqPlaceRow[] = places.map((place) => {
    if (!town || place.isHqTown) return { place, townRoute: null };
    const found = routes.filter((r) => isPair(r, town.id, place.id)).sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))[0] ?? null;
    if (found) townRoutes.add(found.id);
    return { place, townRoute: found };
  });
  rows.sort(
    (a, b) =>
      Number(b.place.isHqTown) - Number(a.place.isHqTown) ||
      Number(b.place.status === 'active') - Number(a.place.status === 'active') ||
      a.place.name.localeCompare(b.place.name),
  );
  const otherRoutes = routes.filter((r) => !townRoutes.has(r.id)).sort((a, b) => a.name.localeCompare(b.name));
  const missing = rows.filter((r) => !r.place.isHqTown && r.place.status === 'active' && r.townRoute?.status !== 'active').length;
  return { town, places: rows, otherRoutes, counts: { places: places.length, routes: routes.length, missing } };
}
