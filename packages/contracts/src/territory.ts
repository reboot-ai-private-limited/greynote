export const TERRITORY_STATUSES = ['active', 'inactive'] as const;
export type TerritoryStatus = (typeof TERRITORY_STATUSES)[number];

/** Which of a grade's three DA rates applies to a day worked on a Route. */
export const ROUTE_TYPES = ['HQ', 'EX_STATION', 'OUT_STATION'] as const;
export type RouteType = (typeof ROUTE_TYPES)[number];

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
/** At least one field; the server rejects an empty update. Renaming an HQ re-names its Routes. */
export interface UpdateHqDto {
  name?: string | undefined;
  status?: TerritoryStatus | undefined;
}

/**
 * A Route: "<HQ> to <destination>" with a km typed by Admin. `distanceKm` is a two-decimal string,
 * null only for a Route migrated from the map version that has no km yet. There is no HQ name
 * (join it client-side).
 */
export interface RouteDto {
  id: string;
  hqId: string;
  name: string;
  type: RouteType;
  /** `AUTO`: the type follows the km. `MANUAL`: chosen by a person. Routes from before this existed are MANUAL. */
  typeSource: 'AUTO' | 'MANUAL';
  /** Set on a single Route's reads and writes (not lists): the km suggests another type than the one set. A warning, never a refusal. */
  typeWarning?: string | null | undefined;
  destinationName: string;
  distanceKm: string | null;
  /** Paise per km; null means the pay band's rate applies. */
  taPerKmRateOverridePaise: number | null;
  status: TerritoryStatus;
}

export interface CreateRouteDto {
  hqId: string;
  /** The route's name is made from it: "<HQ> to <destination>". */
  destinationName: string;
  /** Typed by Admin: more than 0, up to 2 decimals. */
  distanceKm: string;
  /** Left out: the type follows the km (AUTO). */
  type?: RouteType | undefined;
  taPerKmRateOverridePaise?: number | null | undefined;
}

export interface UpdateRouteDto {
  destinationName?: string | undefined;
  distanceKm?: string | undefined;
  type?: RouteType | undefined;
  /** `AUTO` hands the type back to the km. */
  typeSource?: 'AUTO' | undefined;
  status?: TerritoryStatus | undefined;
  /** `null` clears the override. */
  taPerKmRateOverridePaise?: number | null | undefined;
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

/** One result of `GET /territory/places/search`: used to place a doctor, chemist or distributor on the map. */
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
