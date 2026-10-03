import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Route } from '../../domain/route.entity.js';
import type { RouteAssignmentRepositoryPort } from '../../domain/routeAssignment.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { assertNameFree, assertNoActiveChildren, assertParentUsable } from './hierarchyRules.js';

/**
 * Name, type, status and the per-route TA rate — nothing that touches the destination or
 * distance, so no revision check. A type change only affects DA generated from now on (LLD). `taPerKmRateOverridePaise: null` clears the override.
 */
export class UpdateRouteUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly assignments: RouteAssignmentRepositoryPort,
  ) {}

  async execute(id: string, input: Partial<Pick<Route, 'name' | 'type' | 'status' | 'taPerKmRateOverridePaise'>>): Promise<Route> {
    const route = await this.routes.findById(id);
    if (!route) throw AppError.notFound();

    if (input.name !== undefined) assertNameFree(await this.routes.findByName(route.hqId, input.name), 'route', id);
    if (input.status === 'inactive' && route.status === 'active') {
      assertNoActiveChildren(await this.assignments.countActiveForRoute(id), 'route', 'assignments');
    }
    if (input.status === 'active' && route.status === 'inactive') {
      assertParentUsable(await this.hqs.findById(route.hqId), 'hqId', 'HQ');
    }
    return this.routes.update(id, input);
  }
}
