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
 * A town or station under one HQ (decision-log 2026-11-26). Routes run Place ↔ Place. `type` is the DA a day there pays
 * that HQ's own people. Every HQ has one `isHqTown` place, named after it; it follows the HQ and can't be edited itself.
 */
export interface PlaceDto {
  id: string;
  hqId: string;
  name: string;
  type: RouteType;
  isHqTown: boolean;
  status: TerritoryStatus;
}
export interface CreatePlaceDto {
  hqId: string;
  name: string;
  type: RouteType;
}
/** At least one field. A rename or new type re-makes the place's routes. */
export interface UpdatePlaceDto {
  name?: string | undefined;
  type?: RouteType | undefined;
  status?: TerritoryStatus | undefined;
}

/**
 * A Route: since 2026-11-26 between two places ("From to To"), serving both directions, with a one-way km typed by
 * Admin; its HQ (the From place's), name and type come from the places. A route from before Places that has not
 * been migrated has no ends and is "<HQ> to <destination>". `distanceKm` is a two-decimal string,
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
  /** A fixed TA for a day on this route (a bus fare), paise: paid as typed. At most one of this and the rate is set. Absent from older servers. */
  taFixedPaise?: number | null | undefined;
  /** The two ends; null on a route not yet migrated. Absent from older servers. */
  fromPlaceId?: string | null | undefined;
  toPlaceId?: string | null | undefined;
  status: TerritoryStatus;
}

/** Place ↔ Place. At most one of the rate and the fixed amount. */
export interface CreatePlaceRouteDto {
  fromPlaceId: string;
  toPlaceId: string;
  /** Typed by Admin, one way: more than 0, up to 2 decimals. */
  distanceKm: string;
  taPerKmRateOverridePaise?: number | null | undefined;
  taFixedPaise?: number | null | undefined;
}
/** The form from before Places, still accepted: it becomes HQ town ↔ a place named `destinationName` (made with `type`, or the km's, if new). */
export interface CreateLegacyRouteDto {
  hqId: string;
  destinationName: string;
  distanceKm: string;
  type?: RouteType | undefined;
  taPerKmRateOverridePaise?: number | null | undefined;
  taFixedPaise?: number | null | undefined;
}
export type CreateRouteDto = CreatePlaceRouteDto | CreateLegacyRouteDto;

export interface UpdateRouteDto {
  destinationName?: string | undefined;
  distanceKm?: string | undefined;
  type?: RouteType | undefined;
  /** `AUTO` hands the type back to the km. */
  typeSource?: 'AUTO' | undefined;
  status?: TerritoryStatus | undefined;
  /** `null` clears the override. Setting it clears `taFixedPaise`. */
  taPerKmRateOverridePaise?: number | null | undefined;
  /** `null` clears it. Setting it clears the rate. */
  taFixedPaise?: number | null | undefined;
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

/** One row of `GET /territory/manager-candidates`: someone who can be chosen as an employee's reporting manager. */
export interface ManagerCandidateDto {
  id: string;
  employeeCode: string;
  name: string;
  /** `name` is MR, ASM, RSM, ZSM or NSM; `level` 1 to 5. */
  designation: { id: string | null; name: string; level: number };
  /** `covers`: their coverage includes the employee's HQ (the NSM covers everywhere). `none`: no coverage recorded yet, so listed unfiltered. `missing`: a coverage that leaves the HQ out, listed last. */
  coverage: 'covers' | 'none' | 'missing';
}

/** `GET` and `PUT /territory/users/:userId/coverage`: the HQs (ASM, RSM) or Zones (ZSM) a manager covers. Eligibility only; approvals still follow the direct manager. */
export interface ManagerCoverageDto {
  userId: string;
  hqIds: string[];
  zoneIds: string[];
}
export type SetManagerCoverageDto = Pick<ManagerCoverageDto, 'hqIds' | 'zoneIds'>;

/** `POST /territory/users/:userId/extend-territory` (Admin, HR): what an employee put under this manager adds to the manager's territory. Union only. */
export interface ExtendManagerTerritoryDto {
  hqIds: string[];
  zoneIds: string[];
  /** Ignored since 2026-11-16: routes are no longer copied onto a manager, they are computed from the team. Kept so older clients still validate. */
  routeIds: string[];
}

/** What a permanent delete of a Zone, HQ or Route would take with it (`GET /territory/{zones|hqs|routes}/:id/delete-impact`). Counts, so Admin can see before confirming. */
export interface TerritoryDeleteImpactDto {
  kind: 'ZONE' | 'HQ' | 'ROUTE';
  id: string;
  name: string;
  /** Deleted together with it (the item itself is not counted). */
  alsoDeleted: { zones: number; hqs: number; routes: number };
  /** The first few names of what is also deleted, to recognise it. */
  alsoDeletedNames: string[];
  people: {
    /** Distinct employees touched in any of the ways below. */
    total: number;
    /** Hold one of the routes. */
    routes: number;
    /** Have one of the HQs as their main HQ. */
    hq: number;
    /** Cover one of the HQs or Zones. */
    coverage: number;
  };
  /** Records elsewhere that point at it and stay: they show the old name, and doctors and chemists need a new route. */
  references: {
    doctors: number;
    chemists: number;
    distributors: number;
    holidays: number;
    /** Daily plans from today on that use one of the routes. */
    plannedDays: number;
  };
}

/** `DELETE /territory/{zones|hqs|routes}/:id`. */
export interface TerritoryDeleteResultDto {
  deleted: { zones: number; hqs: number; routes: number };
}

/** `GET /territory/team-gaps` and `/users/:userId/team-gaps` (Admin, HR): what a manager's direct reports cover or hold that the manager does not. */
export interface TerritoryGapDto {
  managerId: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  /** MR 1 … NSM 5. */
  level: number;
  /** Direct reports looked at. */
  reports: number;
  hqIds: string[];
  zoneIds: string[];
  /** Only for an ASM or RSM. */
  routeIds: string[];
}
