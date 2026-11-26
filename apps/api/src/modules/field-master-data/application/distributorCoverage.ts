import type { CoverageScope, Distributor } from '../domain/distributor.entity.js';
import type { TerritoryPort } from '../domain/territory.port.js';

const overlaps = (a: readonly string[], b: readonly string[]) => a.some((id) => b.includes(id));

/** True when the distributor's coverage and this scope share a Zone, an HQ, a Route or a place. */
export function coverageMeets(distributor: Pick<Distributor, 'zoneIds' | 'hqIds' | 'routeIds' | 'placeIds'>, scope: CoverageScope): boolean {
  return (
    overlaps(distributor.zoneIds, scope.zoneIds) ||
    overlaps(distributor.hqIds, scope.hqIds) ||
    overlaps(distributor.routeIds, scope.routeIds) ||
    overlaps(distributor.placeIds, scope.placeIds)
  );
}

/**
 * What an employee works in: their Routes, the HQs those sit in, and the Zones of those HQs. A distributor meets it when it covers any of
 * the three — a Zone-wide distributor serves every Route in the Zone, a Route-only one just that Route.
 */
export async function scopeOfUser(territory: TerritoryPort, userId: string): Promise<CoverageScope> {
  // Since 2026-11-26: the HQ they are based in, its Zone, its places and its routes.
  const [places, routes] = await Promise.all([territory.listPlacesForUser(userId), territory.listRoutesForUser(userId)]);
  const hqIds = [...new Set([...places.map((p) => p.hqId), ...routes.map((r) => r.hqId)])];
  const zoneIds = new Set<string>();
  for (const hqId of hqIds) {
    const hq = await territory.getHq(hqId);
    if (hq) zoneIds.add(hq.zoneId);
  }
  return { zoneIds: [...zoneIds], hqIds, routeIds: routes.map((r) => r.id), placeIds: places.map((p) => p.id) };
}

/** Everything a place stands for, as a scope to match distributors against: the Route, its HQ and Zone (or an HQ and its Zone, or a Zone). */
export async function scopeOfPlace(
  territory: TerritoryPort,
  place: { placeId?: string | undefined; routeId?: string | undefined; hqId?: string | undefined; zoneId?: string | undefined },
): Promise<CoverageScope> {
  if (place.placeId) {
    const found = await territory.getPlace(place.placeId);
    const hq = found ? await territory.getHq(found.hqId) : null;
    return { zoneIds: hq ? [hq.zoneId] : [], hqIds: found ? [found.hqId] : [], routeIds: [], placeIds: [place.placeId] };
  }
  if (place.routeId) {
    const [path, route] = await Promise.all([territory.getRoutePath(place.routeId), territory.getRoute(place.routeId)]);
    const placeIds = route?.toPlaceId ? [route.toPlaceId] : [];
    return path ? { zoneIds: [path.zoneId], hqIds: [path.hqId], routeIds: [place.routeId], placeIds } : { zoneIds: [], hqIds: [], routeIds: [place.routeId], placeIds };
  }
  if (place.hqId) {
    const hq = await territory.getHq(place.hqId);
    return {
      zoneIds: hq ? [hq.zoneId] : [],
      hqIds: [place.hqId],
      routeIds: await territory.listRouteIdsInScope({ hqId: place.hqId }),
      placeIds: await territory.listPlaceIdsInScope({ hqId: place.hqId }),
    };
  }
  if (place.zoneId) {
    return {
      zoneIds: [place.zoneId],
      hqIds: await territory.listHqIdsInZone(place.zoneId),
      routeIds: await territory.listRouteIdsInScope({ zoneId: place.zoneId }),
      placeIds: await territory.listPlaceIdsInScope({ zoneId: place.zoneId }),
    };
  }
  return { zoneIds: [], hqIds: [], routeIds: [], placeIds: [] };
}

/** Every Route the distributor serves today — the phone's cache wants concrete Routes, not a Zone it cannot expand. */
export async function expandRouteIds(territory: TerritoryPort, distributor: Pick<Distributor, 'zoneIds' | 'hqIds' | 'routeIds' | 'placeIds'>): Promise<string[]> {
  const ids = new Set(distributor.routeIds);
  for (const placeId of distributor.placeIds) {
    const anchor = await territory.anchorRouteForPlace(placeId);
    if (anchor) ids.add(anchor);
  }
  for (const hqId of distributor.hqIds) for (const id of await territory.listRouteIdsInScope({ hqId })) ids.add(id);
  for (const zoneId of distributor.zoneIds) for (const id of await territory.listRouteIdsInScope({ zoneId })) ids.add(id);
  return [...ids];
}
