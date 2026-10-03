import type { Place } from './place.js';
import type { TerritoryStatus } from './territoryStatus.js';

/** Which of a grade's three DA rates applies to a day worked on this Route (HLD 06 §2). */
export const ROUTE_TYPES = ['HQ', 'EX_STATION', 'OUT_STATION'] as const;
export type RouteType = (typeof ROUTE_TYPES)[number];

export const DISTANCE_SOURCES = ['AUTO_CALCULATED', 'MANUAL_OVERRIDE'] as const;
export type DistanceSource = (typeof DISTANCE_SOURCES)[number];

/** No `PENDING`: distance is calculated during the save, so nothing is ever waiting (decision-log 2026-09-24). */
export const DISTANCE_STATUSES = ['CALCULATED', 'FAILED'] as const;
export type DistanceStatus = (typeof DISTANCE_STATUSES)[number];

/**
 * One destination place reached from its HQ's base place, and the road distance TA is paid on.
 * Name is unique within its HQ, ignoring case. `type` decides the DA rate (decision-log 2026-10-03).
 *
 * `distanceKm` is a decimal string with up to 2 places (a distance, not money; the `Decimal128`
 * conversion lives only in the Mongo adapter). `taPerKmRateOverridePaise` is money: whole paise.
 */
export interface Route {
  id: string;
  hqId: string;
  name: string;
  type: RouteType;
  destination: Place;
  /** Null exactly when `distanceStatus` is `FAILED`. Used as-is for TA — never doubled (sign-off D7). */
  distanceKm: string | null;
  distanceSource: DistanceSource;
  distanceStatus: DistanceStatus;
  distanceCalculatedAt: Date | null;
  /** Paise per km; overrides the MR's `PayBand.taPerKmRatePaise` on this route. Survives destination edits. */
  taPerKmRateOverridePaise: number | null;
  /**
   * Bumped by every write that changes the destination or the distance. Each of those writes is
   * conditional on the revision it started from, so two concurrent edits (or an edit racing a
   * slow recalculation) produce a 409, never a silent overwrite.
   */
  revision: number;
  status: TerritoryStatus;
}

export type RouteDistanceFields = Pick<
  Route,
  'distanceKm' | 'distanceSource' | 'distanceStatus' | 'distanceCalculatedAt'
>;
