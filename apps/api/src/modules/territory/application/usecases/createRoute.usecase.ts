import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { PlaceRepositoryPort } from '../../domain/place.repository.port.js';
import type { RouteType } from '../../domain/route.entity.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import { suggestRouteType } from '../../domain/routeType.js';
import { assertParentUsable } from './hierarchyRules.js';
import type { PlaceRoutes } from './placeRoutes.js';
import type { RouteTypeRules, RouteWithWarning } from './routeTypeRules.js';

type TaInput = {
  distanceKm: string;
  taPerKmRateOverridePaise?: number | null | undefined;
  taFixedPaise?: number | null | undefined;
};
/** Place ↔ Place (decision-log 2026-11-26). */
export type CreatePlaceRouteInput = TaInput & { fromPlaceId: string; toPlaceId: string };
/** The form from before Places: "<HQ> to <destination>". Kept for older clients; it becomes HQ town ↔ a place of that name. */
export type CreateLegacyRouteInput = TaInput & { hqId: string; destinationName: string; type?: RouteType | undefined };

/**
 * A route between two places, with the km Admin typed (one way) and its TA: the grade's rate, its own rate per km,
 * or a fixed amount. One route per pair of places, serving both directions. Its HQ, name and type come from the
 * places (`PlaceRoutes.endsOf`).
 */
export class CreateRouteUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly places: PlaceRepositoryPort,
    private readonly placeRoutes: PlaceRoutes,
    private readonly typeRules: RouteTypeRules,
  ) {}

  async execute(input: CreatePlaceRouteInput | CreateLegacyRouteInput): Promise<RouteWithWarning> {
    if (input.taPerKmRateOverridePaise != null && input.taFixedPaise != null) {
      throw AppError.badRequest('Choose either a rate per km or a fixed amount, not both.', { field: 'taFixedPaise' });
    }
    const { fromPlaceId, toPlaceId } = 'fromPlaceId' in input ? input : await this.placesForLegacy(input);
    const { from, to } = await this.placeRoutes.usableEnds(fromPlaceId, toPlaceId);
    if (await this.routes.findByPair(from.id, to.id)) {
      throw AppError.conflict('A route between these two places already exists.', { field: 'toPlaceId' });
    }

    const created = await this.routes.create({
      ...(await this.placeRoutes.endsOf(from, to)),
      typeSource: 'MANUAL',
      distanceKm: input.distanceKm,
      taPerKmRateOverridePaise: input.taPerKmRateOverridePaise ?? null,
      taFixedPaise: input.taFixedPaise ?? null,
      status: 'active',
    });
    return this.typeRules.annotate(created);
  }

  /** The HQ's town and a place named after the destination (made with the given type, or the km's), each created if missing. */
  private async placesForLegacy(input: CreateLegacyRouteInput): Promise<{ fromPlaceId: string; toPlaceId: string }> {
    const hq = await this.hqs.findById(input.hqId);
    assertParentUsable(hq, 'hqId', 'HQ');
    const town = await this.placeRoutes.ensureHqTown(hq);
    const existing = await this.places.findByName(hq.id, input.destinationName);
    const destination =
      existing ??
      (await this.places.create({
        hqId: hq.id,
        name: input.destinationName,
        type: input.type ?? suggestRouteType(input.distanceKm, await this.typeRules.thresholds()) ?? 'HQ',
        isHqTown: false,
        status: 'active',
      }));
    return { fromPlaceId: town.id, toPlaceId: destination.id };
  }
}
