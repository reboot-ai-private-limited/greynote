import { AppError } from '@/shared/errors/AppError.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { typeChangeForDistance } from '../../domain/routeType.js';
import type { RouteTypeRules, RouteWithWarning } from './routeTypeRules.js';
import { staleRevision } from './staleRevision.js';

/**
 * Admin sets the distance by hand (real money moves on it). Makes the route `CALCULATED` even if
 * the provider had failed — there is now a real figure. The destination is untouched; the next
 * destination edit or recalculation replaces this value.
 */
export class OverrideRouteDistanceUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly typeRules: RouteTypeRules,
  ) {}

  async execute(id: string, input: { distanceKm: string }): Promise<RouteWithWarning> {
    const route = await this.routes.findById(id);
    if (!route) throw AppError.notFound();

    const updated = await this.routes.updateAtRevision(id, route.revision, {
      distanceKm: input.distanceKm,
      distanceSource: 'MANUAL_OVERRIDE',
      distanceStatus: 'CALCULATED',
      distanceCalculatedAt: new Date(),
      ...typeChangeForDistance(route, input.distanceKm, await this.typeRules.thresholds()),
    });
    if (!updated) throw staleRevision(await this.routes.findById(id));
    return this.typeRules.annotate(updated);
  }
}
