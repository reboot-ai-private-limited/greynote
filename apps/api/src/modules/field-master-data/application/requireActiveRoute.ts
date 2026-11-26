import { AppError } from '@/shared/errors/AppError.js';
import type { TerritoryPort } from '../domain/territory.port.js';

/** A record (a distributor's routes) can only be put on a Route that exists and is active. */
export async function requireActiveRoute(territory: TerritoryPort, routeId: string): Promise<void> {
  const route = await territory.getRoute(routeId);
  if (!route) throw AppError.notFound('No such route.');
  if (route.status !== 'active') throw AppError.conflict('This route is inactive.', { field: 'routeId' });
}

/**
 * Where a doctor or chemist goes (decision-log 2026-11-26): a place, given directly (`placeId`), or — from a client that still sends a
 * route — the route's To place. The place must exist and be active. Also returns the route the record keeps as its `routeId` for the
 * readers that still go by routes until the Tour Plan reads places (phase 4): the route given, else the place's anchor route. A place with
 * no active route can't take a record yet (nobody could plan a day there).
 */
export async function resolvePlace(territory: TerritoryPort, input: { placeId?: string | null | undefined; routeId?: string | null | undefined }): Promise<{ placeId: string; routeId: string }> {
  let placeId = input.placeId ?? null;
  let routeId: string | null = null;
  if (!placeId && input.routeId) {
    const route = await territory.getRoute(input.routeId);
    if (!route) throw AppError.notFound('No such route.');
    if (route.status !== 'active') throw AppError.conflict('This route is inactive.', { field: 'routeId' });
    if (!route.toPlaceId) throw AppError.conflict('This route has no places yet. Run the places migration first.', { field: 'routeId' });
    placeId = route.toPlaceId;
    routeId = route.id;
  }
  if (!placeId) throw AppError.badRequest('Choose a place.', { field: 'placeId' });
  const place = await territory.getPlace(placeId);
  if (!place) throw AppError.badRequest('No such place.', { field: 'placeId' });
  if (place.status !== 'active') throw AppError.conflict('This place is inactive.', { field: 'placeId' });
  routeId ??= await territory.anchorRouteForPlace(placeId);
  if (!routeId) throw AppError.conflict('This place has no active route yet. Add a route to it under Territory → Routes first.', { field: 'placeId' });
  return { placeId, routeId };
}

/** Is this place one of the places of the HQ the employee is based in? */
export async function placeInUsersHq(territory: TerritoryPort, userId: string, placeId: string): Promise<boolean> {
  return (await territory.listPlacesForUser(userId)).some((p) => p.id === placeId);
}

/**
 * An employee can only add a doctor or chemist on a place of the HQ they are based in (2026-11-26; it was "a Route they have"). The phone
 * sends a route: its To place counts, and a refusal names `routeId` so the phone's sync shows its usual message.
 */
export async function resolveOwnPlace(
  territory: TerritoryPort,
  userId: string,
  input: { placeId?: string | undefined; routeId?: string | undefined },
): Promise<{ placeId: string; routeId: string }> {
  const viaRoute = !input.placeId;
  const refuse = () => AppError.badRequest(viaRoute ? 'That route isn’t one of yours.' : 'That place isn’t in your HQ.', { field: viaRoute ? 'routeId' : 'placeId' });
  let where: { placeId: string; routeId: string };
  try {
    where = await resolvePlace(territory, input);
  } catch {
    throw refuse();
  }
  if (!(await placeInUsersHq(territory, userId, where.placeId))) throw refuse();
  return where;
}
