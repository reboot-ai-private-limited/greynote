import { AppError } from '@/shared/errors/AppError.js';
import type { DistanceProviderPort } from '../../domain/distanceProvider.port.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Place } from '../../domain/place.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import { assertNameFree, assertNoActiveChildren, assertParentUsable } from './hierarchyRules.js';
import type { RouteTypeRules } from './routeTypeRules.js';
import { recalculateHqRoutes, type RouteRecalculationReport } from './recalculateHqRoutes.js';

export type UpdateHqResult = Hq & {
  /** Present only when the base place changed: what happened to this HQ's Routes. */
  routeRecalculation?: RouteRecalculationReport;
};

const samePlace = (a: Place | null, b: Place) =>
  a !== null && a.placeId === b.placeId && a.latitude === b.latitude && a.longitude === b.longitude;

/**
 * Name, status and base place — moving an HQ to another Zone is deliberately not supported (LLD).
 * Changing the base place recalculates the HQ's Routes (except manual overrides) and reports what
 * it did; setting it for the first time does the same, which is how an HQ that predates the base
 * place gets real distances.
 */
export class UpdateHqUseCase {
  constructor(
    private readonly hqs: HqRepositoryPort,
    private readonly zones: ZoneRepositoryPort,
    private readonly routes: RouteRepositoryPort,
    private readonly distance: DistanceProviderPort,
    private readonly typeRules: RouteTypeRules,
  ) {}

  async execute(id: string, input: Partial<Pick<Hq, 'name' | 'status' | 'basePlace'>>): Promise<UpdateHqResult> {
    const hq = await this.hqs.findById(id);
    if (!hq) throw AppError.notFound();

    if (input.name !== undefined) assertNameFree(await this.hqs.findByName(hq.zoneId, input.name), 'HQ', id);
    if (input.status === 'inactive' && hq.status === 'active') {
      assertNoActiveChildren(await this.routes.countActiveInHq(id), 'HQ', 'routes');
    }
    if (input.status === 'active' && hq.status === 'inactive') {
      assertParentUsable(await this.zones.findById(hq.zoneId), 'zoneId', 'zone');
    }

    const updated = await this.hqs.update(id, input);
    const newBase = input.basePlace;
    if (!newBase || samePlace(hq.basePlace, newBase)) return updated;
    return { ...updated, routeRecalculation: await recalculateHqRoutes(this.routes, this.distance, id, newBase, this.typeRules) };
  }
}
