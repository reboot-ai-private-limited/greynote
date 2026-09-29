import type { AreaRepositoryPort } from '../../domain/area.repository.port.js';
import type { DistanceProviderPort } from '../../domain/distanceProvider.port.js';
import type { Route, Waypoint } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { assertNameFree, assertParentUsable } from './hierarchyRules.js';
import { calculateDistance } from './routeDistance.js';

export class CreateRouteUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly areas: AreaRepositoryPort,
    private readonly distance: DistanceProviderPort,
  ) {}

  async execute(input: {
    areaId: string;
    name: string;
    waypoints: Waypoint[];
    taPerKmRateOverridePaise?: number | null | undefined;
  }): Promise<Route> {
    assertParentUsable(await this.areas.findById(input.areaId), 'areaId', 'area');
    assertNameFree(await this.routes.findByName(input.areaId, input.name), 'route');

    return this.routes.create({
      areaId: input.areaId,
      name: input.name,
      waypoints: input.waypoints,
      ...(await calculateDistance(this.distance, input.waypoints)),
      taPerKmRateOverridePaise: input.taPerKmRateOverridePaise ?? null,
      revision: 1,
      status: 'active',
    });
  }
}
