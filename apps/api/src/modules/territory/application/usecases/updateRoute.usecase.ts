import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Route, RouteTypeSource } from '../../domain/route.entity.js';
import { suggestRouteType } from '../../domain/routeType.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { RouteTypeRules, RouteWithWarning } from './routeTypeRules.js';
import { assertNameFree, assertNoActiveChildren, assertParentUsable } from './hierarchyRules.js';

/**
 * Name, type, status and the per-route TA rate — nothing that touches the destination or
 * distance, so no revision check. Choosing a `type` makes it MANUAL; `typeSource: 'AUTO'` hands it back to the distance. A type change only affects DA generated from now on (LLD). `taPerKmRateOverridePaise: null` clears the override.
 */
export class UpdateRouteUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly assignments: RouteAssignmentRepositoryPort,
    private readonly typeRules: RouteTypeRules,
  ) {}

  async execute(id: string, input: Partial<Pick<Route, 'name' | 'type' | 'status' | 'taPerKmRateOverridePaise'>> & { typeSource?: RouteTypeSource | undefined }): Promise<RouteWithWarning> {
    const route = await this.routes.findById(id);
    if (!route) throw AppError.notFound();

    if (input.name !== undefined) assertNameFree(await this.routes.findByName(route.hqId, input.name), 'route', id);
    if (input.status === 'inactive' && route.status === 'active') {
      assertNoActiveChildren(await this.assignments.countActiveForRoute(id), 'route', 'assignments');
    }
    if (input.status === 'active' && route.status === 'inactive') {
      assertParentUsable(await this.hqs.findById(route.hqId), 'hqId', 'HQ');
    }
    const { typeSource, ...fields } = input;
    const change: Parameters<RouteRepositoryPort['update']>[1] = { ...fields };
    if (typeSource === 'AUTO' && input.type === undefined) {
      change.typeSource = 'AUTO';
      // Back to following the distance: take the suggestion now (an unknown distance keeps the current type until it is known).
      const suggested = suggestRouteType(route.distanceKm, await this.typeRules.thresholds());
      if (suggested) change.type = suggested;
    } else if (input.type !== undefined) {
      change.typeSource = 'MANUAL';
    }
    return this.typeRules.annotate(await this.routes.update(id, change));
  }
}
