import { AppError } from '@/shared/errors/AppError.js';
import type { Hq } from '../../domain/hq.entity.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { Place } from '../../domain/place.js';

/** The HQ's base place — the origin of its Routes' distances. An HQ without one can't have a Route yet. */
export function requireBasePlace(hq: Pick<Hq, 'basePlace'>): Place {
  if (!hq.basePlace) {
    throw AppError.conflict("This HQ has no base place yet. Set the HQ's base place first.", { field: 'hqId' });
  }
  return hq.basePlace;
}

/** A Route's HQ and its base place. A Route always has an HQ — a missing one is a broken invariant. */
export async function loadRouteOrigin(hqs: HqRepositoryPort, route: { id: string; hqId: string }): Promise<Place> {
  const hq = await hqs.findById(route.hqId);
  if (!hq) throw AppError.internal('INTERNAL', { reason: 'ROUTE_HQ_NOT_FOUND', routeId: route.id });
  return requireBasePlace(hq);
}
