import type { Route, RouteType } from './route.entity.js';

/** Distances (km) from the HQ beyond which a Route is suggested as Ex-station / Out-station — `EX_STATION_MIN_KM`, `OUT_STATION_MIN_KM`. */
export interface StationThresholds {
  exStationKm: number;
  outStationKm: number;
}

/** Strictly "over": exactly the threshold stays in the lower type. A null distance (provider failed) suggests nothing. */
export function suggestRouteType(distanceKm: string | null, thresholds: StationThresholds): RouteType | null {
  if (distanceKm === null) return null;
  const km = Number(distanceKm);
  if (km > thresholds.outStationKm) return 'OUT_STATION';
  if (km > thresholds.exStationKm) return 'EX_STATION';
  return 'HQ';
}

const LABEL: Record<RouteType, string> = { HQ: 'HQ', EX_STATION: 'Ex-station', OUT_STATION: 'Out-station' };

/** A chosen type that disagrees with the distance is allowed — this is the sentence shown beside it, never a refusal. */
export function routeTypeWarning(route: Pick<Route, 'type' | 'typeSource' | 'distanceKm'>, thresholds: StationThresholds): string | null {
  if (route.typeSource === 'AUTO') return null;
  const suggested = suggestRouteType(route.distanceKm, thresholds);
  if (!suggested || suggested === route.type) return null;
  return `${route.distanceKm} km suggests ${LABEL[suggested]}, but this Route is set to ${LABEL[route.type]}. DA follows the type that is set.`;
}

/** What a changed distance does to the type: an AUTO Route follows it, a MANUAL one (or an unknown distance) keeps its type. */
export function typeChangeForDistance(
  route: Pick<Route, 'type' | 'typeSource'>,
  distanceKm: string | null,
  thresholds: StationThresholds,
): { type: RouteType } | Record<string, never> {
  if (route.typeSource !== 'AUTO') return {};
  const suggested = suggestRouteType(distanceKm, thresholds);
  return suggested && suggested !== route.type ? { type: suggested } : {};
}
