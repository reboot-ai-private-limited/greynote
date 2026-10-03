import { AppError } from '@/shared/errors/AppError.js';
import type { DistanceProviderPort } from '../../domain/distanceProvider.port.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Route } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { loadRouteOrigin } from './hqBasePlace.js';
import { staleRevision } from './staleRevision.js';
import { calculateDistance } from './routeDistance.js';

/**
 * Admin's retry for a `FAILED` route (or a refresh of any route). Like a destination edit, it
 * replaces a manual override with the calculated figure.
 */
export class RecalculateRouteDistanceUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly distance: DistanceProviderPort,
  ) {}

  async execute(id: string): Promise<Route> {
    const route = await this.routes.findById(id);
    if (!route) throw AppError.notFound();

    const origin = await loadRouteOrigin(this.hqs, route);
    const distance = await calculateDistance(this.distance, origin, route.destination);
    // Conditional on the revision read above: a destination edit or override that landed during the
    // provider call wins, instead of being overwritten with a distance for the old destination.
    const updated = await this.routes.updateAtRevision(id, route.revision, distance);
    if (!updated) throw staleRevision(await this.routes.findById(id));
    return updated;
  }
}
