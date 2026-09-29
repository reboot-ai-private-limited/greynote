import { AppError } from '@/shared/errors/AppError.js';
import type { TerritoryPort } from '../domain/territory.port.js';

/** A Chemist (or, later, a Doctor or Distributor) can only be put on a Route that exists and is active. */
export async function requireActiveRoute(territory: TerritoryPort, routeId: string): Promise<void> {
  const route = await territory.getRoute(routeId);
  if (!route) throw AppError.notFound('No such route.');
  if (route.status !== 'active') throw AppError.conflict('This route is inactive.', { field: 'routeId' });
}
