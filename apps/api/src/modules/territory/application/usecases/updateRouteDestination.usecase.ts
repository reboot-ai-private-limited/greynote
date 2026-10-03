import { AppError } from '@/shared/errors/AppError.js';
import type { DistanceProviderPort } from '../../domain/distanceProvider.port.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Place } from '../../domain/place.js';
import type { Route } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { loadRouteOrigin } from './hqBasePlace.js';
import { staleRevision } from './staleRevision.js';
import { calculateDistance } from './routeDistance.js';

/**
 * Replaces the destination and recalculates the distance, which resets any manual override — the
 * geography changed, so the old figure is stale by definition (HLD 02 §3). Any save counts, even
 * one with an identical destination (LLD edge case, accepted).
 *
 * `revision` is the one the caller's edit was based on: an edit made against an outdated view of
 * the route is refused rather than silently replacing someone else's newer destination.
 */
export class UpdateRouteDestinationUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly distance: DistanceProviderPort,
  ) {}

  async execute(id: string, input: { destination: Place; revision: number }): Promise<Route> {
    const route = await this.routes.findById(id);
    if (!route) throw AppError.notFound();
    // Checked before the provider call too, so a stale edit doesn't spend a paid API request.
    if (route.revision !== input.revision) throw staleRevision(route);

    const origin = await loadRouteOrigin(this.hqs, route);
    const distance = await calculateDistance(this.distance, origin, input.destination);
    const updated = await this.routes.updateAtRevision(id, input.revision, { destination: input.destination, ...distance });
    if (!updated) throw staleRevision(await this.routes.findById(id));
    return updated;
  }
}
