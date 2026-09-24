import { AppError } from '@/shared/errors/AppError.js';
import type { AreaRepositoryPort } from '../../domain/area.repository.port.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { RoutePath } from '../../domain/routeView.js';
import { findRouteArea } from './routeSummaries.js';

/** Contract read: `null` for an unknown id. Zone/HQ are always reached through the Area (ERD 02). */
export class GetRoutePathUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly areas: AreaRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  async execute(routeId: string): Promise<RoutePath | null> {
    const route = await this.routes.findById(routeId);
    if (!route) return null;
    const area = await findRouteArea(this.areas, route);
    const hq = await this.hqs.findById(area.hqId);
    if (!hq) throw AppError.internal('INTERNAL', { reason: 'AREA_HQ_NOT_FOUND', areaId: area.id });
    return { routeId: route.id, areaId: area.id, areaType: area.type, hqId: hq.id, zoneId: hq.zoneId };
  }
}
