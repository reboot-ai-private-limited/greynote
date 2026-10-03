import type { DistanceProviderPort } from '../../domain/distanceProvider.port.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Place } from '../../domain/place.js';
import type { Route, RouteType } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { assertNameFree, assertParentUsable } from './hierarchyRules.js';
import { requireBasePlace } from './hqBasePlace.js';
import { calculateDistance } from './routeDistance.js';

export class CreateRouteUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly distance: DistanceProviderPort,
  ) {}

  async execute(input: {
    hqId: string;
    name: string;
    type: RouteType;
    destination: Place;
    taPerKmRateOverridePaise?: number | null | undefined;
  }): Promise<Route> {
    const hq = await this.hqs.findById(input.hqId);
    assertParentUsable(hq, 'hqId', 'HQ');
    const origin = requireBasePlace(hq);
    assertNameFree(await this.routes.findByName(input.hqId, input.name), 'route');

    return this.routes.create({
      hqId: input.hqId,
      name: input.name,
      type: input.type,
      destination: input.destination,
      ...(await calculateDistance(this.distance, origin, input.destination)),
      taPerKmRateOverridePaise: input.taPerKmRateOverridePaise ?? null,
      revision: 1,
      status: 'active',
    });
  }
}
