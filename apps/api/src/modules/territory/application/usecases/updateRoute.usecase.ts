import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import { routeNameFor, type Route, type RouteChange, type RouteTypeSource } from '../../domain/route.entity.js';
import { suggestRouteType } from '../../domain/routeType.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { RouteTypeRules, RouteWithWarning } from './routeTypeRules.js';
import { assertNameFree, assertNoActiveChildren, assertParentUsable } from './hierarchyRules.js';
import type { PlaceRoutes } from './placeRoutes.js';

type RouteEdit = Partial<Pick<Route, 'destinationName' | 'distanceKm' | 'type' | 'status' | 'taPerKmRateOverridePaise' | 'taFixedPaise'>> & {
  typeSource?: RouteTypeSource | undefined;
};

/**
 * km, status and TA. TA is one of: the grade's rate (both null), the route's own rate per km, or a fixed amount;
 * setting one clears the other.
 *
 * A route between places (decision-log 2026-11-26) takes its name and type from them: change the place instead.
 * Reactivating it needs both places active.
 *
 * A route from before Places (not yet migrated) keeps the old rules: a new destination re-makes the name
 * ("<HQ> to <destination>"); choosing a `type` makes it MANUAL; `typeSource: 'AUTO'` hands it back to the km.
 */
export class UpdateRouteUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly assignments: RouteAssignmentRepositoryPort,
    private readonly placeRoutes: PlaceRoutes,
    private readonly typeRules: RouteTypeRules,
  ) {}

  async execute(id: string, input: RouteEdit): Promise<RouteWithWarning> {
    const route = await this.routes.findById(id);
    if (!route) throw AppError.notFound();
    const hq = await this.hqs.findById(route.hqId);
    if (!hq) throw AppError.internal('INTERNAL', { reason: 'ROUTE_HQ_NOT_FOUND', routeId: id });

    const { typeSource, ...fields } = input;
    const change: RouteChange = { ...fields };
    if (input.taFixedPaise != null) change.taPerKmRateOverridePaise = null;
    if (input.taPerKmRateOverridePaise != null) change.taFixedPaise = null;

    if (input.status === 'inactive' && route.status === 'active') {
      assertNoActiveChildren(await this.assignments.countActiveForRoute(id), 'route', 'assignments');
    }

    if (route.fromPlaceId && route.toPlaceId) {
      if (input.destinationName !== undefined || input.type !== undefined || typeSource !== undefined) {
        throw AppError.badRequest("A route's name and type come from its two places. Change the place instead.", { field: 'type' });
      }
      if (input.status === 'active' && route.status === 'inactive') {
        await this.placeRoutes.usableEnds(route.fromPlaceId, route.toPlaceId);
      }
      return this.typeRules.annotate(await this.routes.update(id, change));
    }

    if (input.destinationName !== undefined && input.destinationName !== route.destinationName) {
      const name = routeNameFor(hq.name, input.destinationName);
      assertNameFree(await this.routes.findByName(route.hqId, name), 'route', id);
      change.name = name;
    }
    if (input.status === 'active' && route.status === 'inactive') {
      assertParentUsable(hq, 'hqId', 'HQ');
    }
    if (input.type !== undefined) {
      change.typeSource = 'MANUAL';
    } else if (typeSource === 'AUTO' || (route.typeSource === 'AUTO' && input.distanceKm !== undefined)) {
      change.typeSource = 'AUTO';
      // Following the km: take the suggestion now (an unknown km keeps the current type until it is known).
      const suggested = suggestRouteType(input.distanceKm ?? route.distanceKm, await this.typeRules.thresholds());
      if (suggested) change.type = suggested;
    }
    return this.typeRules.annotate(await this.routes.update(id, change));
  }
}
