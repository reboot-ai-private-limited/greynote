import { AppError } from '@/shared/errors/AppError.js';
import type { TerritoryPort } from '../domain/territory.port.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

/** Everyone a Distributor is handed to must be an active FIELD employee, of any designation. */
export async function requireFieldUsers(users: UserDirectoryPort, userIds: string[], field = 'assignedUserIds'): Promise<void> {
  for (const userId of new Set(userIds)) {
    const user = await users.findUserSummary(userId);
    if (!user) throw AppError.badRequest('No such employee.', { field });
    if (user.role !== 'FIELD') throw AppError.badRequest('Only field employees can be assigned to a distributor.', { field });
    if (user.status === 'inactive') throw AppError.conflict('That employee is inactive.', { field });
  }
}

/** A Distributor's Routes must all exist, be active, and sit in one Zone — the Zone is how the Admin finds them, so it must be one. */
export async function requireRoutesInOneZone(territory: TerritoryPort, routeIds: string[], onlyCheckActive: readonly string[] = routeIds): Promise<void> {
  if (routeIds.length === 0) throw AppError.badRequest('Choose at least one route.', { field: 'routeIds' });
  const zones = new Set<string>();
  for (const routeId of new Set(routeIds)) {
    const route = await territory.getRoute(routeId);
    if (!route) throw AppError.notFound('No such route.');
    if (route.status !== 'active' && onlyCheckActive.includes(routeId)) throw AppError.conflict('This route is inactive.', { field: 'routeIds' });
    const path = await territory.getRoutePath(routeId);
    if (path) zones.add(path.zoneId);
  }
  if (zones.size > 1) throw AppError.badRequest('All of a distributor\'s routes must be in the same zone.', { field: 'routeIds', code: 'ROUTES_IN_DIFFERENT_ZONES' });
}
