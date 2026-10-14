import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import { routeNameFor, type Route, type RouteTypeSource } from '../../domain/route.entity.js';
import { suggestRouteType } from '../../domain/routeType.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { RouteTypeRules, RouteWithWarning } from './routeTypeRules.js';
import { assertNameFree, assertNoActiveChildren, assertParentUsable } from './hierarchyRules.js';

type RouteEdit = Partial<Pick<Route, 'destinationName' | 'distanceKm' | 'type' | 'status' | 'taPerKmRateOverridePaise'>> & {
  typeSource?: RouteTypeSource | undefined;
};

/**
 * Destination, km, type, status and the per-route TA rate. A new destination re-makes the name
 * ("<HQ> to <destination>"). Choosing a `type` makes it MANUAL; `typeSource: 'AUTO'` hands it back
 * to the km, and a new km moves an AUTO type with it. A type change only affects DA generated from
 * now on (LLD). `taPerKmRateOverridePaise: null` clears the override.
 */
export class UpdateRouteUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly assignments: RouteAssignmentRepositoryPort,
    private readonly typeRules: RouteTypeRules,
  ) {}

  async execute(id: string, input: RouteEdit): Promise<RouteWithWarning> {
    const route = await this.routes.findById(id);
    if (!route) throw AppError.notFound();
    const hq = await this.hqs.findById(route.hqId);
    if (!hq) throw AppError.internal('INTERNAL', { reason: 'ROUTE_HQ_NOT_FOUND', routeId: id });

    const { typeSource, ...fields } = input;
    const change: Parameters<RouteRepositoryPort['update']>[1] = { ...fields };

    if (input.destinationName !== undefined && input.destinationName !== route.destinationName) {
      const name = routeNameFor(hq.name, input.destinationName);
      assertNameFree(await this.routes.findByName(route.hqId, name), 'route', id);
      change.name = name;
    }
    if (input.status === 'inactive' && route.status === 'active') {
      assertNoActiveChildren(await this.assignments.countActiveForRoute(id), 'route', 'assignments');
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
