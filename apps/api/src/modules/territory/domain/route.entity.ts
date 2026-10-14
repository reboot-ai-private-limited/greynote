import type { TerritoryStatus } from './territoryStatus.js';

/** Which of a grade's three DA rates applies to a day worked on this Route (HLD 06 §2). */
export const ROUTE_TYPES = ['HQ', 'EX_STATION', 'OUT_STATION'] as const;
export type RouteType = (typeof ROUTE_TYPES)[number];

/** `AUTO`: the type follows the distance. `MANUAL`: someone chose it, and only someone changes it. */
export const ROUTE_TYPE_SOURCES = ['AUTO', 'MANUAL'] as const;
export type RouteTypeSource = (typeof ROUTE_TYPE_SOURCES)[number];

/**
 * One destination reached from its HQ, and the distance TA is paid on. Admin types the destination
 * and the km; there is no map (decision-log 2026-10-14). `name` is always "<HQ> to <destination>",
 * so it is unique within the HQ exactly when the destination is, ignoring case.
 *
 * `distanceKm` is a decimal string with up to 2 places (a distance, not money; the `Decimal128`
 * conversion lives only in the Mongo adapter). It is null only for a Route migrated from the map
 * version that never got a distance: TA flags such a day until Admin types the km.
 * `taPerKmRateOverridePaise` is money: whole paise.
 */
export interface Route {
  id: string;
  hqId: string;
  name: string;
  destinationName: string;
  type: RouteType;
  /** `AUTO`: the type follows the distance (`EX_STATION_MIN_KM` / `OUT_STATION_MIN_KM`). `MANUAL`: chosen by a person, kept as chosen. */
  typeSource: RouteTypeSource;
  /** Used as-is for TA — never doubled (sign-off D7). */
  distanceKm: string | null;
  /** Paise per km; overrides the MR's `PayBand.taPerKmRatePaise` on this route. */
  taPerKmRateOverridePaise: number | null;
  status: TerritoryStatus;
}

/** "SLG-1 to Naxalbari" — the only way a Route's name is made. */
export const routeNameFor = (hqName: string, destinationName: string): string => `${hqName} to ${destinationName}`;
