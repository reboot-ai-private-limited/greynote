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
  constructor(
    private readonly places: PlaceRepositoryPort,
    private readonly routes?: RouteRepositoryPort,
  ) {}

  /**
   * `missingHqTownRoute`: only the active places (not HQ towns) with no active route to their HQ town — what still needs a km on the
   * Territory page. Worked out over the whole filtered list, then paged.
   */
  async execute(query: PlaceListQuery & { missingHqTownRoute?: boolean | undefined }): Promise<PaginatedResult<Place>> {
    const { missingHqTownRoute, ...rest } = query;
    if (!missingHqTownRoute || !this.routes) {
      const { items, total } = await this.places.list(rest);
      return buildPaginatedResult(items, total, rest);
    }
    const all = (await this.places.list({ ...rest, status: 'active', page: 1, pageSize: 100_000 })).items.filter((p) => !p.isHqTown);
    const towns = new Map<string, string | null>();
    const missing: Place[] = [];
    for (const p of all) {
      if (!towns.has(p.hqId)) towns.set(p.hqId, (await this.places.findHqTown(p.hqId))?.id ?? null);
      const town = towns.get(p.hqId);
      const route = town ? await this.routes.findByPair(p.id, town) : null;
      if (route?.status !== 'active') missing.push(p);
    }
    const start = (rest.page - 1) * rest.pageSize;
    return buildPaginatedResult(missing.slice(start, start + rest.pageSize), missing.length, rest);
  }
}

/** What adding a place made: the place and the id of its route from the HQ town. */
export type CreatedPlace = Place & { routeId: string };

/** Makes the route HQ town ↔ the new place (the same rules as any route). */
export type HqTownRouteMaker = (input: { fromPlaceId: string; toPlaceId: string; distanceKm: string; taPerKmRateOverridePaise?: number | null | undefined; taFixedPaise?: number | null | undefined }) => Promise<{ id: string }>;

/**
 * A town or station under an HQ, with the DA type a day there pays that HQ's people, and — always (2026-11-27: one way to make a route) —
 * its route from the HQ town, with the km and TA given. Everything is checked before anything is written; if the route still can't be
 * made, the place is removed again, so a place never exists without the route it is planned by.
 */
export class CreatePlaceUseCase {
  constructor(
    private readonly places: PlaceRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly makeRoute: HqTownRouteMaker,
  ) {}

  async execute(input: {
    hqId: string;
    name: string;
    type: RouteType;
    distanceKm: string;
    taPerKmRateOverridePaise?: number | null | undefined;
    taFixedPaise?: number | null | undefined;
  }): Promise<CreatedPlace> {
    const hq = await this.hqs.findById(input.hqId);
    assertParentUsable(hq, 'hqId', 'HQ');
    assertNameFree(await this.places.findByName(input.hqId, input.name), 'place');
    if (input.taPerKmRateOverridePaise != null && input.taFixedPaise != null) {
      throw AppError.badRequest('Choose either a rate per km or a fixed amount, not both.', { field: 'taFixedPaise' });
    }
    const town = await this.places.findHqTown(input.hqId);
    if (!town || town.status !== 'active') throw AppError.conflict('This HQ has no active HQ town place.', { field: 'hqId' });

    const place = await this.places.create({ hqId: input.hqId, name: input.name, type: input.type, isHqTown: false, status: 'active' });
    try {
      const route = await this.makeRoute({
        fromPlaceId: town.id,
        toPlaceId: place.id,
        distanceKm: input.distanceKm,
        taPerKmRateOverridePaise: input.taPerKmRateOverridePaise ?? null,
        taFixedPaise: input.taFixedPaise ?? null,
      });
      return { ...place, routeId: route.id };
    } catch (err) {
      await this.places.delete(place.id);
      throw err;
    }
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
