export const TERRITORY_STATUSES = ['active', 'inactive'] as const;
export type TerritoryStatus = (typeof TERRITORY_STATUSES)[number];

/** Which of a grade's three DA rates applies to a day worked in an Area. */
export const AREA_TYPES = ['HQ', 'EX_STATION', 'OUT_STATION'] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export interface ZoneDto {
  id: string;
  name: string;
  status: TerritoryStatus;
}

export interface HqDto {
  id: string;
  zoneId: string;
  name: string;
  status: TerritoryStatus;
}

export interface AreaDto {
  id: string;
  hqId: string;
  name: string;
  type: AreaType;
  status: TerritoryStatus;
}

export interface CreateZoneDto {
  name: string;
}
/** At least one field; the server rejects an empty update. */
export interface UpdateZoneDto {
  name?: string | undefined;
  status?: TerritoryStatus | undefined;
}

export interface CreateHqDto {
  zoneId: string;
  name: string;
}
export type UpdateHqDto = UpdateZoneDto;

export interface CreateAreaDto {
  hqId: string;
  name: string;
  type: AreaType;
}
export interface UpdateAreaDto {
  name?: string | undefined;
  type?: AreaType | undefined;
  status?: TerritoryStatus | undefined;
}

/** Waypoint count limits for a Route (Google takes origin, destination and up to 23 stops via). */
export const MIN_WAYPOINTS = 2;
export const MAX_WAYPOINTS = 25;

export interface WaypointDto {
  label: string;
  latitude: number;
  longitude: number;
  /** Google place id. Only a place found by search can be a waypoint. */
  placeId: string;
}

export type DistanceStatus = 'CALCULATED' | 'FAILED';
export type DistanceSource = 'AUTO_CALCULATED' | 'MANUAL_OVERRIDE';

/**
 * A Route. `distanceKm` is a two-decimal string, and null exactly when `distanceStatus` is FAILED.
 * There is no route geometry, and no Area/HQ names (join those client-side).
 */
export interface RouteDto {
  id: string;
  areaId: string;
  name: string;
  waypoints: WaypointDto[];
  distanceKm: string | null;
  distanceSource: DistanceSource;
  distanceStatus: DistanceStatus;
  distanceCalculatedAt: string | null;
  /** Paise per km; null means the pay band's rate applies. */
  taPerKmRateOverridePaise: number | null;
  revision: number;
  status: TerritoryStatus;
}

export interface CreateRouteDto {
  areaId: string;
  name: string;
  waypoints: WaypointDto[];
  taPerKmRateOverridePaise?: number | null | undefined;
}

export interface UpdateRouteDto {
  name?: string | undefined;
  status?: TerritoryStatus | undefined;
  /** `null` clears the override. */
  taPerKmRateOverridePaise?: number | null | undefined;
}

export interface UpdateWaypointsDto {
  waypoints: WaypointDto[];
  /** The `revision` of the route as loaded — a stale one is a 409. */
  revision: number;
}

export interface RouteAssignmentDto {
  id: string;
  routeId: string;
  userId: string;
  status: TerritoryStatus;
  assignedAt: string;
  assignedBy: string;
  unassignedAt: string | null;
  unassignedBy: string | null;
  user: { id: string; employeeCode: string; name: string } | null;
}

/** One result of `GET /territory/places/search`. Maps directly onto a Waypoint. */
export interface PlaceCandidateDto {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId: string;
}
