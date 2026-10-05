import type { DistanceProviderPort } from '../../domain/distanceProvider.port.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Place } from '../../domain/place.js';
import type { RouteType } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { assertNameFree, assertParentUsable } from './hierarchyRules.js';
import { requireBasePlace } from './hqBasePlace.js';
import { suggestRouteType } from '../../domain/routeType.js';
import { calculateDistance } from './routeDistance.js';
import type { RouteTypeRules, RouteWithWarning } from './routeTypeRules.js';

export class CreateRouteUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly distance: DistanceProviderPort,
    private readonly typeRules: RouteTypeRules,
  ) {}

  async execute(input: {
    hqId: string;
    name: string;
    /** Left out: the type follows the distance (AUTO). Given: kept as chosen (MANUAL), with a warning if the distance disagrees. */
    type?: RouteType | undefined;
    destination: Place;
    taPerKmRateOverridePaise?: number | null | undefined;
  }): Promise<RouteWithWarning> {
    const hq = await this.hqs.findById(input.hqId);
    assertParentUsable(hq, 'hqId', 'HQ');
    const origin = requireBasePlace(hq);
    assertNameFree(await this.routes.findByName(input.hqId, input.name), 'route');

    const distance = await calculateDistance(this.distance, origin, input.destination);
    // AUTO with no usable distance starts as HQ (the lowest DA) and follows the distance once a recalculation succeeds.
    const type = input.type ?? suggestRouteType(distance.distanceKm, await this.typeRules.thresholds()) ?? 'HQ';
    const created = await this.routes.create({
      hqId: input.hqId,
      name: input.name,
      type,
      typeSource: input.type ? 'MANUAL' : 'AUTO',
      destination: input.destination,
      ...distance,
      taPerKmRateOverridePaise: input.taPerKmRateOverridePaise ?? null,
      revision: 1,
      status: 'active',
    });
    return this.typeRules.annotate(created);
  }
}
