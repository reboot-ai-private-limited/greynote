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

export interface CoverageIds {
  zoneIds: string[];
  hqIds: string[];
  routeIds: string[];
}

/**
 * A Distributor serves at least one Zone, HQ or Route, and each one named must exist and be active. Ids it already holds are exempt
 * from the active check, so an HQ that has since gone inactive can stay until Admin changes it. A place in a Zone that is not named is
 * fine: Zone, HQ and Route each stand for everything under them, so naming an HQ alone is a complete choice.
 */
export async function requireCoverage(territory: TerritoryPort, coverage: CoverageIds, already: Partial<CoverageIds> = {}): Promise<void> {
  if (coverage.zoneIds.length + coverage.hqIds.length + coverage.routeIds.length === 0) {
    throw AppError.badRequest('Choose at least one zone, HQ or route.', { field: 'zoneIds' });
  }
  for (const id of new Set(coverage.zoneIds)) {
    const zone = await territory.getZone(id);
    if (!zone) throw AppError.notFound('No such zone.');
    if (zone.status !== 'active' && !already.zoneIds?.includes(id)) throw AppError.conflict('This zone is inactive.', { field: 'zoneIds' });
  }
  for (const id of new Set(coverage.hqIds)) {
    const hq = await territory.getHq(id);
    if (!hq) throw AppError.notFound('No such HQ.');
    if (hq.status !== 'active' && !already.hqIds?.includes(id)) throw AppError.conflict('This HQ is inactive.', { field: 'hqIds' });
  }
  for (const id of new Set(coverage.routeIds)) {
    const route = await territory.getRoute(id);
    if (!route) throw AppError.notFound('No such route.');
    if (route.status !== 'active' && !already.routeIds?.includes(id)) throw AppError.conflict('This route is inactive.', { field: 'routeIds' });
  }
}
