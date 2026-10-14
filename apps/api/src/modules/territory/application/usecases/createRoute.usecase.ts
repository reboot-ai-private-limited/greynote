import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import { routeNameFor, type RouteType } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { suggestRouteType } from '../../domain/routeType.js';
import { assertNameFree, assertParentUsable } from './hierarchyRules.js';
import type { RouteTypeRules, RouteWithWarning } from './routeTypeRules.js';

/**
 * HQ + destination name + km (+ optional type). The name is "<HQ> to <destination>"; the type
 * follows the km unless one is given, in which case it is kept as chosen (MANUAL) with a warning
 * if the km disagrees.
 */
export class CreateRouteUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly typeRules: RouteTypeRules,
  ) {}

  async execute(input: {
    hqId: string;
    destinationName: string;
    distanceKm: string;
    type?: RouteType | undefined;
    taPerKmRateOverridePaise?: number | null | undefined;
  }): Promise<RouteWithWarning> {
    const hq = await this.hqs.findById(input.hqId);
    assertParentUsable(hq, 'hqId', 'HQ');
    const name = routeNameFor(hq.name, input.destinationName);
    assertNameFree(await this.routes.findByName(input.hqId, name), 'route');

    const type = input.type ?? suggestRouteType(input.distanceKm, await this.typeRules.thresholds()) ?? 'HQ';
    const created = await this.routes.create({
      hqId: input.hqId,
      name,
      destinationName: input.destinationName,
      type,
      typeSource: input.type ? 'MANUAL' : 'AUTO',
      distanceKm: input.distanceKm,
      taPerKmRateOverridePaise: input.taPerKmRateOverridePaise ?? null,
      status: 'active',
    });
    return this.typeRules.annotate(created);
  }
}
