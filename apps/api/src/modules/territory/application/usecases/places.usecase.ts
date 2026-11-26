import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Place } from '../../domain/place.entity.js';
import type { PlaceListQuery, PlaceRepositoryPort } from '../../domain/place.repository.port.js';
import type { RouteType } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { TerritoryStatus } from '../../domain/territoryStatus.js';
import { assertNameFree, assertNoActiveChildren, assertParentUsable } from './hierarchyRules.js';
import type { PlaceRoutes } from './placeRoutes.js';

export class ListPlacesUseCase {
  constructor(private readonly places: PlaceRepositoryPort) {}

  async execute(query: PlaceListQuery): Promise<PaginatedResult<Place>> {
    const { items, total } = await this.places.list(query);
    return buildPaginatedResult(items, total, query);
  }
}

/** A town or station under an HQ, with the DA type a day there pays that HQ's people. */
export class CreatePlaceUseCase {
  constructor(
    private readonly places: PlaceRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  async execute(input: { hqId: string; name: string; type: RouteType }): Promise<Place> {
    assertParentUsable(await this.hqs.findById(input.hqId), 'hqId', 'HQ');
    assertNameFree(await this.places.findByName(input.hqId, input.name), 'place');
    return this.places.create({ hqId: input.hqId, name: input.name, type: input.type, isHqTown: false, status: 'active' });
  }
}

/**
 * Name, type and status. A rename re-names its routes; a new type re-types them (a type change only affects DA
 * generated from now on). The HQ town follows its HQ: it is renamed and (de)activated with it, and is always HQ type.
 */
export class UpdatePlaceUseCase {
  constructor(
    private readonly places: PlaceRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly routes: RouteRepositoryPort,
    private readonly placeRoutes: PlaceRoutes,
  ) {}

  async execute(id: string, input: { name?: string | undefined; type?: RouteType | undefined; status?: TerritoryStatus | undefined }): Promise<Place> {
    const place = await this.places.findById(id);
    if (!place) throw AppError.notFound();
    if (place.isHqTown) {
      throw AppError.badRequest('The HQ town follows its HQ: rename or deactivate the HQ instead.', { field: 'name' });
    }
    if (input.name !== undefined) assertNameFree(await this.places.findByName(place.hqId, input.name), 'place', id);
    if (input.status === 'inactive' && place.status === 'active') {
      assertNoActiveChildren(await this.routes.countActiveTouchingPlace(id), 'place', 'routes');
    }
    if (input.status === 'active' && place.status === 'inactive') {
      assertParentUsable(await this.hqs.findById(place.hqId), 'hqId', 'HQ');
    }

    const updated = await this.places.update(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.status !== undefined && { status: input.status }),
    });
    if ((input.name !== undefined && input.name !== place.name) || (input.type !== undefined && input.type !== place.type)) {
      await this.placeRoutes.refreshRoutesOf([id]);
    }
    return updated;
  }
}
