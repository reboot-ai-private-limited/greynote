import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { RouteRepositoryPort } from '../../domain/route.repository.port.js';
import type { RoutePath } from '../../domain/routeView.js';

/** Contract read: `null` for an unknown id. The Zone is always reached through the HQ (ERD 02). */
export class GetRoutePathUseCase {
  constructor(
    private readonly routes: RouteRepositoryPort,
    private readonly hqs: HqRepositoryPort,
  ) {}

  async execute(routeId: string): Promise<RoutePath | null> {
    const route = await this.routes.findById(routeId);
    if (!route) return null;
    const hq = await this.hqs.findById(route.hqId);
    if (!hq) throw AppError.internal('INTERNAL', { reason: 'ROUTE_HQ_NOT_FOUND', routeId: route.id });
    return { routeId: route.id, routeType: route.type, hqId: hq.id, zoneId: hq.zoneId };
  }
}
