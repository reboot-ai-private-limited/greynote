import type { TerritoryStatus } from './territoryStatus.js';

/** Google's Routes API takes origin + destination + up to 25 intermediates; we cap the total at 25. */
export const MIN_WAYPOINTS = 2;
export const MAX_WAYPOINTS = 25;

/** A point Admin confirmed on the map — never a bare typed label (HLD 02 §1). */
export interface Waypoint {
  label: string;
  latitude: number;
  longitude: number;
  placeId: string;
}

export const DISTANCE_SOURCES = ['AUTO_CALCULATED', 'MANUAL_OVERRIDE'] as const;
export type DistanceSource = (typeof DISTANCE_SOURCES)[number];

/** No `PENDING`: distance is calculated during the save, so nothing is ever waiting (decision-log 2026-09-24). */
export const DISTANCE_STATUSES = ['CALCULATED', 'FAILED'] as const;
export type DistanceStatus = (typeof DISTANCE_STATUSES)[number];

/**
 * An ordered set of waypoints inside one Area, and the road distance TA is paid on. Name is
 * unique within its Area, ignoring case. Uses its Area's type for DA — no override (sign-off D5).
 *
 * `distanceKm` is a decimal string with up to 2 places (a distance, not money; the `Decimal128`
 * conversion lives only in the Mongo adapter). `taPerKmRateOverridePaise` is money: whole paise.
 */
export interface Route {
  id: string;
  areaId: string;
  name: string;
  waypoints: Waypoint[];
  /** Null exactly when `distanceStatus` is `FAILED`. Used as-is for TA — never doubled (sign-off D7). */
  distanceKm: string | null;
  distanceSource: DistanceSource;
  distanceStatus: DistanceStatus;
  distanceCalculatedAt: Date | null;
  /** Paise per km; overrides the MR's `PayBand.taPerKmRatePaise` on this route. Survives waypoint edits. */
  taPerKmRateOverridePaise: number | null;
  /**
   * Bumped by every write that changes the waypoints or the distance. Each of those writes is
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
