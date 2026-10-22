import type { PlanRoute, RouteDirectoryPort } from '../domain/routeDirectory.port.js';

/**
 * The routes a plan names, once each and in the order first named, with their names and types — so a manager reading a team
 * member's plan sees "Naxalbari · Ex-station" without holding that person's routes. An unknown id is left out.
 */
export async function namePlanRoutes(routes: RouteDirectoryPort, routeIds: string[]): Promise<PlanRoute[]> {
  const found = await Promise.all([...new Set(routeIds)].map((id) => routes.getRoute(id)));
  return found.filter((r): r is PlanRoute => r !== null).map((r) => ({ id: r.id, name: r.name, routeType: r.routeType }));
}
