import { AppError } from '@/shared/errors/AppError.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import { placeRouteName, routeTypeBetween, type Place } from '../../domain/place.entity.js';
import type { PlaceRepositoryPort } from '../../domain/place.repository.port.js';
import type { Route, RouteChange } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { assertParentUsable } from './hierarchyRules.js';

/** What a Place ↔ Place route stores that comes from its two ends. */
export type RouteEnds = Pick<Route, 'hqId' | 'name' | 'destinationName' | 'type' | 'fromPlaceId' | 'toPlaceId'>;

/**
 * The rules that tie routes to their places (decision-log 2026-11-26): a route's HQ, name and type come from its
 * two ends, so renaming or re-typing a place (or renaming an HQ) re-makes every route that touches it.
 */
export class PlaceRoutes {
  constructor(
    private readonly places: PlaceRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly routes: RouteRepositoryPort,
  ) {}

  /** The HQ's town place, created (named after the HQ, type HQ) when it is missing. */
  async ensureHqTown(hq: Hq): Promise<Place> {
    const town = await this.places.findHqTown(hq.id);
    if (town) return town;
    return this.places.create({ hqId: hq.id, name: hq.name, type: 'HQ', isHqTown: true, status: hq.status });
  }

  /** Both ends must exist, be active and differ. */
  async usableEnds(fromPlaceId: string, toPlaceId: string): Promise<{ from: Place; to: Place }> {
    if (fromPlaceId === toPlaceId) {
      throw AppError.badRequest('A route needs two different places. A day spent at one place needs no route.', { field: 'toPlaceId' });
    }
    const [from, to] = await Promise.all([this.places.findById(fromPlaceId), this.places.findById(toPlaceId)]);
    assertParentUsable(from, 'fromPlaceId', 'place');
    assertParentUsable(to, 'toPlaceId', 'place');
    return { from, to };
  }

  async endsOf(from: Place, to: Place): Promise<RouteEnds> {
    const toHq = to.hqId === from.hqId || to.isHqTown ? null : await this.hqs.findById(to.hqId);
    return {
      hqId: from.hqId,
      name: placeRouteName(from, to, from.hqId, toHq?.name ?? ''),
      destinationName: to.name,
      type: routeTypeBetween(from, to),
      fromPlaceId: from.id,
      toPlaceId: to.id,
    };
  }

  /** Re-makes the name and type of every route touching these places. */
  async refreshRoutesOf(placeIds: string[]): Promise<void> {
    const seen = new Set<string>();
    for (const placeId of placeIds) {
      for (const route of await this.routes.listTouchingPlace(placeId)) {
        if (seen.has(route.id) || !route.fromPlaceId || !route.toPlaceId) continue;
        seen.add(route.id);
        const [from, to] = await Promise.all([this.places.findById(route.fromPlaceId), this.places.findById(route.toPlaceId)]);
        if (!from || !to) continue;
        const ends = await this.endsOf(from, to);
        const change: RouteChange = {};
        if (ends.name !== route.name) change.name = ends.name;
        if (ends.destinationName !== route.destinationName) change.destinationName = ends.destinationName;
        if (ends.type !== route.type) change.type = ends.type;
        if (Object.keys(change).length > 0) await this.routes.update(route.id, change);
      }
    }
  }
}
