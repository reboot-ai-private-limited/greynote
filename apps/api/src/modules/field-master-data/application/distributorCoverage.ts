import type { CoverageScope, Distributor } from '../domain/distributor.entity.js';
import type { TerritoryPort } from '../domain/territory.port.js';

const overlaps = (a: readonly string[], b: readonly string[]) => a.some((id) => b.includes(id));

/** True when the distributor's coverage and this scope share a Zone, an HQ or a Route. */
export function coverageMeets(distributor: Pick<Distributor, 'zoneIds' | 'hqIds' | 'routeIds'>, scope: CoverageScope): boolean {
  return overlaps(distributor.zoneIds, scope.zoneIds) || overlaps(distributor.hqIds, scope.hqIds) || overlaps(distributor.routeIds, scope.routeIds);
}

/**
 * What an employee works in: their Routes, the HQs those sit in, and the Zones of those HQs. A distributor meets it when it covers any of
 * the three — a Zone-wide distributor serves every Route in the Zone, a Route-only one just that Route.
 */
export async function scopeOfUser(territory: TerritoryPort, userId: string): Promise<CoverageScope> {
  const routes = await territory.listRoutesForUser(userId);
  const hqIds = [...new Set(routes.map((r) => r.hqId))];
  const zoneIds = new Set<string>();
  for (const hqId of hqIds) {
    const hq = await territory.getHq(hqId);
    if (hq) zoneIds.add(hq.zoneId);
  }
  return { zoneIds: [...zoneIds], hqIds, routeIds: routes.map((r) => r.id) };
}

/** Everything a place stands for, as a scope to match distributors against: the Route, its HQ and Zone (or an HQ and its Zone, or a Zone). */
export async function scopeOfPlace(territory: TerritoryPort, place: { routeId?: string | undefined; hqId?: string | undefined; zoneId?: string | undefined }): Promise<CoverageScope> {
  if (place.routeId) {
    const path = await territory.getRoutePath(place.routeId);
    return path ? { zoneIds: [path.zoneId], hqIds: [path.hqId], routeIds: [place.routeId] } : { zoneIds: [], hqIds: [], routeIds: [place.routeId] };
  }
  if (place.hqId) {
    const hq = await territory.getHq(place.hqId);
    return { zoneIds: hq ? [hq.zoneId] : [], hqIds: [place.hqId], routeIds: await territory.listRouteIdsInScope({ hqId: place.hqId }) };
  }
  if (place.zoneId) {
    return { zoneIds: [place.zoneId], hqIds: await territory.listHqIdsInZone(place.zoneId), routeIds: await territory.listRouteIdsInScope({ zoneId: place.zoneId }) };
  }
  return { zoneIds: [], hqIds: [], routeIds: [] };
}

/** Every Route the distributor serves today — the phone's cache wants concrete Routes, not a Zone it cannot expand. */
export async function expandRouteIds(territory: TerritoryPort, distributor: Pick<Distributor, 'zoneIds' | 'hqIds' | 'routeIds'>): Promise<string[]> {
  const ids = new Set(distributor.routeIds);
  for (const hqId of distributor.hqIds) for (const id of await territory.listRouteIdsInScope({ hqId })) ids.add(id);
  for (const zoneId of distributor.zoneIds) for (const id of await territory.listRouteIdsInScope({ zoneId })) ids.add(id);
  return [...ids];
}
