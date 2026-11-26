import type { RouteType } from './route.entity.js';
import type { TerritoryStatus } from './territoryStatus.js';

/**
 * A town or station under one HQ (decision-log 2026-11-26). Routes run Place ↔ Place; doctors,
 * chemists and distributors will sit on a Place. `type` is what a day there pays as DA for that
 * HQ's own people (someone from another HQ is always out-station there). Every HQ has exactly one
 * `isHqTown` place, named after the HQ and kept in step with it.
 */
export interface Place {
  id: string;
  hqId: string;
  name: string;
  type: RouteType;
  isHqTown: boolean;
  status: TerritoryStatus;
}

const RANK: Record<RouteType, number> = { HQ: 0, EX_STATION: 1, OUT_STATION: 2 };

/**
 * The type a Place ↔ Place route carries for readers that still go by a route's type (the old TA/DA and
 * the phone): the farther of its two ends, and out-station when the ends are in different HQs.
 */
export function routeTypeBetween(from: Pick<Place, 'hqId' | 'type'>, to: Pick<Place, 'hqId' | 'type'>): RouteType {
  if (from.hqId !== to.hqId) return 'OUT_STATION';
  return RANK[from.type] >= RANK[to.type] ? from.type : to.type;
}

/** One key per unordered pair, so A ↔ B can exist once whichever way it was typed. */
export function pairKeyOf(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * "Siliguri to Naxalbari". A To place in another HQ gets that HQ in brackets ("Siliguri to Mainaguri
 * (Jalpaiguri)") unless it is an HQ town, whose name already is the HQ's.
 */
export function placeRouteName(from: Pick<Place, 'name'>, to: Pick<Place, 'name' | 'hqId' | 'isHqTown'>, fromHqId: string, toHqName: string): string {
  const suffix = to.hqId !== fromHqId && !to.isHqTown ? ` (${toHqName})` : '';
  return `${from.name} to ${to.name}${suffix}`;
}
