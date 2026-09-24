import { AppError } from '@/shared/errors/AppError.js';
import type { AreaRepositoryPort } from '../../domain/area.repository.port.js';
import type { Route } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { assertNameFree, assertParentUsable } from './hierarchyRules.js';

/**
 * Name, status and the per-route TA rate — nothing that touches waypoints or distance, so no
 * revision check. `taPerKmRateOverride: null` clears the override.
 */
export class UpdateRouteUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly areas: AreaRepositoryPort,
  ) {}

  async execute(id: string, input: Partial<Pick<Route, 'name' | 'status' | 'taPerKmRateOverride'>>): Promise<Route> {
    const route = await this.routes.findById(id);
    if (!route) throw AppError.notFound();

    if (input.name !== undefined) assertNameFree(await this.routes.findByName(route.areaId, input.name), 'route', id);
    if (input.status === 'active' && route.status === 'inactive') {
      assertParentUsable(await this.areas.findById(route.areaId), 'areaId', 'area');
    }
    return this.routes.update(id, input);
  }
}
