import { AppError } from '@/shared/errors/AppError.js';
import type { Route } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { staleRevision } from './staleRevision.js';

/**
 * Admin sets the distance by hand (real money moves on it). Makes the route `CALCULATED` even if
 * the provider had failed — there is now a real figure. Waypoints are untouched; the next
 * waypoint edit or recalculation replaces this value.
 */
export class OverrideRouteDistanceUseCase {
  constructor(private readonly routes: RouteRepositoryPort) {}

  async execute(id: string, input: { distanceKm: string }): Promise<Route> {
    const route = await this.routes.findById(id);
    if (!route) throw AppError.notFound();

    const updated = await this.routes.updateAtRevision(id, route.revision, {
      distanceKm: input.distanceKm,
      distanceSource: 'MANUAL_OVERRIDE',
      distanceStatus: 'CALCULATED',
      distanceCalculatedAt: new Date(),
    });
    if (!updated) throw staleRevision(await this.routes.findById(id));
    return updated;
  }
}
