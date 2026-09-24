import { AppError } from '@/shared/errors/AppError.js';
import type { DistanceProviderPort } from '../../domain/distanceProvider.port.js';
import type { Route, Waypoint } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { staleRevision } from './staleRevision.js';
import { calculateDistance } from './routeDistance.js';

/**
 * Replaces the waypoints and recalculates the distance, which resets any manual override — the
 * geography changed, so the old figure is stale by definition (HLD 02 §3). Any save counts, even
 * one with identical waypoints (LLD edge case, accepted).
 *
 * `revision` is the one the caller's edit was based on: an edit made against an outdated view of
 * the route is refused rather than silently replacing someone else's newer waypoints.
 */
export class UpdateRouteWaypointsUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly distance: DistanceProviderPort,
  ) {}

  async execute(id: string, input: { waypoints: Waypoint[]; revision: number }): Promise<Route> {
    const route = await this.routes.findById(id);
    if (!route) throw AppError.notFound();
    // Checked before the provider call too, so a stale edit doesn't spend a paid API request.
    if (route.revision !== input.revision) throw staleRevision(route);

    const distance = await calculateDistance(this.distance, input.waypoints);
    const updated = await this.routes.updateAtRevision(id, input.revision, { waypoints: input.waypoints, ...distance });
    if (!updated) throw staleRevision(await this.routes.findById(id));
    return updated;
  }
}
