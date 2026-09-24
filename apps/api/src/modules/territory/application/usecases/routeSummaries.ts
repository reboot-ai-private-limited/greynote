import { AppError } from '@/shared/errors/AppError.js';
import type { Area } from '../../domain/area.entity.js';
import type { AreaRepositoryPort } from '../../domain/area.repository.port.js';
import type { Route } from '../../domain/route.entity.js';
import type { RouteSummary } from '../../domain/routeView.js';

/** Every Route has an Area — a missing one is a broken invariant, not a caller error. */
export async function findRouteArea(areas: AreaRepositoryPort, route: Route): Promise<Area> {
  const area = await areas.findById(route.areaId);
  if (!area) throw AppError.internal('INTERNAL', { reason: 'ROUTE_AREA_NOT_FOUND', routeId: route.id });
  return area;
}

/** One Area lookup per distinct Area, not per route. */
export async function toRouteSummaries(areas: AreaRepositoryPort, routes: Route[]): Promise<RouteSummary[]> {
  const areaIds = [...new Set(routes.map((r) => r.areaId))];
  const found = await Promise.all(areaIds.map((id) => areas.findById(id)));
  const areaById = new Map(found.filter((a) => a !== null).map((a) => [a.id, a]));

  return routes.map((route) => {
    const area = areaById.get(route.areaId);
    if (!area) throw AppError.internal('INTERNAL', { reason: 'ROUTE_AREA_NOT_FOUND', routeId: route.id });
    return {
      id: route.id,
      name: route.name,
      areaId: area.id,
      areaName: area.name,
      areaType: area.type,
      distanceKm: route.distanceKm,
      distanceStatus: route.distanceStatus,
      taPerKmRateOverride: route.taPerKmRateOverride,
      status: route.status,
    };
  });
}
