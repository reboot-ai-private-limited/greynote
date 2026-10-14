import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Route } from '../../domain/route.entity.js';
import type { RouteSummary } from '../../domain/routeView.js';

/** One HQ lookup per distinct HQ, not per route. Every Route has an HQ — a missing one is a broken invariant. */
export async function toRouteSummaries(hqs: HqRepositoryPort, routes: Route[]): Promise<RouteSummary[]> {
  const found = await hqs.findByIds([...new Set(routes.map((r) => r.hqId))]);
  const hqById = new Map(found.map((h) => [h.id, h]));

  return routes.map((route) => {
    const hq = hqById.get(route.hqId);
    if (!hq) throw AppError.internal('INTERNAL', { reason: 'ROUTE_HQ_NOT_FOUND', routeId: route.id });
    return {
      id: route.id,
      name: route.name,
      hqId: hq.id,
      hqName: hq.name,
      routeType: route.type,
      distanceKm: route.distanceKm,
      distanceStatus: route.distanceKm === null ? 'FAILED' : 'CALCULATED',
      taPerKmRateOverridePaise: route.taPerKmRateOverridePaise,
      status: route.status,
    };
  });
}
