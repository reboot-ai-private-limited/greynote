export const TERRITORY_STATUSES = ['active', 'inactive'] as const;
export type TerritoryStatus = (typeof TERRITORY_STATUSES)[number];

/** Which of a grade's three DA rates applies to a day worked on a Route. */
export const ROUTE_TYPES = ['HQ', 'EX_STATION', 'OUT_STATION'] as const;
export type RouteType = (typeof ROUTE_TYPES)[number];

/** A point Admin confirmed on the map: an HQ's base place or a Route's destination. */
export interface PlaceDto {
  label: string;
  latitude: number;
  longitude: number;
  /** Google place id. Only a place found by search can be saved. */
  placeId: string;
}

export interface ZoneDto {
  id: string;
  name: string;
  status: TerritoryStatus;
}

export interface HqDto {
  id: string;
  zoneId: string;
  name: string;
  /** The origin of every Route's distance. Null only for an HQ that predates it or came from CSV import. */
  basePlace: PlaceDto | null;
  status: TerritoryStatus;
}

/** What an HQ base-place change did to its Routes. Manually overridden Routes are left as they were. */
export interface RouteRecalculationDto {
  recalculated: number;
  /** Could not be calculated, or changed under us. Retry each from the Route. */
  failed: number;
  overridden: Array<{ id: string; name: string }>;
}

/** `PATCH /territory/hqs/:id`: the HQ, plus a report when the base place changed. */
export type UpdateHqResultDto = HqDto & { routeRecalculation?: RouteRecalculationDto };

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
  basePlace: PlaceDto;
}
/** At least one field; the server rejects an empty update. Changing `basePlace` recalculates the HQ's Routes. */
export interface UpdateHqDto {
  name?: string | undefined;
  status?: TerritoryStatus | undefined;
  basePlace?: PlaceDto | undefined;
}

export type DistanceStatus = 'CALCULATED' | 'FAILED';
export type DistanceSource = 'AUTO_CALCULATED' | 'MANUAL_OVERRIDE';

/**
 * A Route. `distanceKm` is a two-decimal string, and null exactly when `distanceStatus` is FAILED.
 * There is no route geometry, and no HQ name (join it client-side).
 */
export interface RouteDto {
  id: string;
  hqId: string;
  name: string;
  type: RouteType;
  /** `AUTO`: the type follows the distance. `MANUAL`: chosen by a person. Routes from before this existed are MANUAL. */
  typeSource: 'AUTO' | 'MANUAL';
  /** Set on a single Route's reads and writes (not lists): the distance suggests another type than the one set. A warning, never a refusal. */
  typeWarning?: string | null | undefined;
  destination: PlaceDto;
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
  hqId: string;
  name: string;
  /** Left out: the type follows the distance (AUTO). */
  type?: RouteType | undefined;
  destination: PlaceDto;
  taPerKmRateOverridePaise?: number | null | undefined;
}

export interface UpdateRouteDto {
  name?: string | undefined;
  type?: RouteType | undefined;
  /** `AUTO` hands the type back to the distance. */
  typeSource?: 'AUTO' | undefined;
  status?: TerritoryStatus | undefined;
  /** `null` clears the override. */
  taPerKmRateOverridePaise?: number | null | undefined;
}

export interface UpdateDestinationDto {
  destination: PlaceDto;
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

/** One result of `GET /territory/places/search`. Maps directly onto a Place. */
export interface PlaceCandidateDto {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId: string;
}

/** One row of `GET /territory/users/:id/hq`, current first: a field employee's HQ, which decides the holidays that apply to them. */
export interface UserHqAssignmentDto {
  id: string;
  userId: string;
  hqId: string;
  status: TerritoryStatus;
  assignedAt: string;
  assignedBy: string;
  unassignedAt: string | null;
  unassignedBy: string | null;
}
