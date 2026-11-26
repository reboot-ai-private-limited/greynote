import { AppError } from '@/shared/errors/AppError.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { PlaceRepositoryPort } from '../../domain/place.repository.port.js';
import { routeNameFor } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { ZoneRepositoryPort } from '../../domain/zone.repository.port.js';
import { assertNameFree, assertNoActiveChildren, assertParentUsable } from './hierarchyRules.js';
import type { PlaceRoutes } from './placeRoutes.js';

/**
 * Name and status — moving an HQ to another Zone is deliberately not supported (LLD). The HQ town place follows
 * it: renamed with it, deactivated and reactivated with it. A rename re-makes the names of the routes that touch
 * the HQ's places (another HQ's route names a place here with the HQ in brackets), and of the HQ's routes from
 * before Places ("<HQ> to <destination>").
 */
export class UpdateHqUseCase {
  constructor(
    private readonly hqs: HqRepositoryPort,
    private readonly zones: ZoneRepositoryPort,
    private readonly routes: RouteRepositoryPort,
    private readonly places: PlaceRepositoryPort,
    private readonly placeRoutes: PlaceRoutes,
  ) {}

  async execute(id: string, input: Partial<Pick<Hq, 'name' | 'status'>>): Promise<Hq> {
    const hq = await this.hqs.findById(id);
    if (!hq) throw AppError.notFound();

    if (input.name !== undefined) assertNameFree(await this.hqs.findByName(hq.zoneId, input.name), 'HQ', id);
    const town = await this.places.findHqTown(id);
    if (input.status === 'inactive' && hq.status === 'active') {
      assertNoActiveChildren(await this.routes.countActiveInHq(id), 'HQ', 'routes');
      if (town) assertNoActiveChildren(await this.routes.countActiveTouchingPlace(town.id), 'HQ', 'routes');
      assertNoActiveChildren(await this.places.countActiveOutsideTownInHq(id), 'HQ', 'places');
    }
    if (input.status === 'active' && hq.status === 'inactive') {
      assertParentUsable(await this.zones.findById(hq.zoneId), 'zoneId', 'zone');
    }

    const updated = await this.hqs.update(id, input);
    if (town && (input.name !== undefined || input.status !== undefined)) {
      await this.places.update(town.id, { name: updated.name, status: updated.status });
    }
    if (input.name !== undefined && input.name !== hq.name) {
      for (const route of await this.routes.listInHq(id)) {
        if (route.fromPlaceId) continue;
        await this.routes.update(route.id, { name: routeNameFor(updated.name, route.destinationName) });
      }
      const placeIds = (await this.places.list({ hqId: id, page: 1, pageSize: 10_000 })).items.map((p) => p.id);
      await this.placeRoutes.refreshRoutesOf(placeIds);
    }
    return updated;
  }
}
