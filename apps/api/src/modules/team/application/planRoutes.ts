import type { TeamPlanRoute, TeamRoutesPort } from '../domain/ports.js';

/**
 * Names the routes of plans for one request, reading each route once however many people plan it. An unknown id is left out.
 * Make one per request: the names are not kept beyond it.
 */
export function makeRouteNamer(routes: TeamRoutesPort): (routeIds: string[]) => Promise<TeamPlanRoute[]> {
  const cache = new Map<string, Promise<TeamPlanRoute | null>>();
  const one = (id: string) => {
    let hit = cache.get(id);
    if (!hit) {
      hit = routes.getRoute(id).then((r) => r && { id: r.id, name: r.name, routeType: r.routeType });
      cache.set(id, hit);
    }
    return hit;
  };
  return async (routeIds) => (await Promise.all(routeIds.map(one))).filter((r): r is TeamPlanRoute => r !== null);
}
