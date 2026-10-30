import type {
  CreateHqDto,
  CreateRouteDto,
  CreateZoneDto,
  HqDto,
  ManagerCandidateDto,
  ManagerCoverageDto,
  SetManagerCoverageDto,
  ExtendManagerTerritoryDto,
  TerritoryGapDto,
  PaginatedDto,
  PaginationQueryDto,
  PlaceCandidateDto,
  RouteAssignmentDto,
  TerritoryDeleteImpactDto,
  TerritoryDeleteResultDto,
  RouteDto,
  RouteType,
  TerritoryStatus,
  UpdateHqDto,
  UpdateRouteDto,
  UpdateZoneDto,
  UserHqAssignmentDto,
  ZoneDto,
} from '@greynote/contracts';
import { request } from '../client';

export interface ListZonesQuery extends PaginationQueryDto {
  status?: TerritoryStatus | undefined;
}
export interface ListHqsQuery extends ListZonesQuery {
  zoneId?: string | undefined;
}

export const zonesApi = {
  list: (token: string, query: ListZonesQuery | undefined, signal?: AbortSignal) =>
    request<PaginatedDto<ZoneDto>>('/territory/zones', { token, ...(query && { query: { ...query } }), signal }),
  create: (token: string, body: CreateZoneDto) =>
    request<ZoneDto>('/territory/zones', { method: 'POST', token, body }),
  update: (token: string, id: string, body: UpdateZoneDto) =>
    request<ZoneDto>(`/territory/zones/${id}`, { method: 'PATCH', token, body }),
};

export const hqsApi = {
  list: (token: string, query: ListHqsQuery | undefined, signal?: AbortSignal) =>
    request<PaginatedDto<HqDto>>('/territory/hqs', { token, ...(query && { query: { ...query } }), signal }),
  create: (token: string, body: CreateHqDto) => request<HqDto>('/territory/hqs', { method: 'POST', token, body }),
  /** Renaming an HQ re-names its Routes. */
  update: (token: string, id: string, body: UpdateHqDto) =>
    request<HqDto>(`/territory/hqs/${id}`, { method: 'PATCH', token, body }),
};

export interface ListRoutesQuery extends ListZonesQuery {
  hqId?: string | undefined;
  zoneId?: string | undefined;
  type?: RouteType | undefined;
}

export const routesApi = {
  list: (token: string, query: ListRoutesQuery | undefined, signal?: AbortSignal) =>
    request<PaginatedDto<RouteDto>>('/territory/routes', { token, ...(query && { query: { ...query } }), signal }),
  get: (token: string, id: string, signal?: AbortSignal) =>
    request<RouteDto>(`/territory/routes/${id}`, { token, signal }),
  create: (token: string, body: CreateRouteDto) =>
    request<RouteDto>('/territory/routes', { method: 'POST', token, body }),
  update: (token: string, id: string, body: UpdateRouteDto) =>
    request<RouteDto>(`/territory/routes/${id}`, { method: 'PATCH', token, body }),
};

export const assignmentsApi = {
  /** Omit `status` for the full history. */
  list: (token: string, routeId: string, status: TerritoryStatus | undefined, signal?: AbortSignal) =>
    request<RouteAssignmentDto[]>(`/territory/routes/${routeId}/assignments`, {
      token,
      ...(status && { query: { status } }),
      signal,
    }),
  assign: (token: string, routeId: string, userId: string) =>
    request<RouteAssignmentDto>(`/territory/routes/${routeId}/assignments`, { method: 'POST', token, body: { userId } }),
  unassign: (token: string, routeId: string, userId: string) =>
    request<RouteAssignmentDto>(`/territory/routes/${routeId}/assignments/${userId}`, { method: 'DELETE', token }),
};

export const placesApi = {
  /** 2–200 chars; at most 10 results. 503 when Google or its server key is unavailable. */
  search: (token: string, q: string, signal?: AbortSignal) =>
    request<PlaceCandidateDto[]>('/territory/places/search', { token, query: { q }, signal }),
};

/** A field employee's HQ, which decides which holidays apply to them. Admin and HR. */
export const userHqApi = {
  history: (token: string, userId: string, signal?: AbortSignal) =>
    request<UserHqAssignmentDto[]>(`/territory/users/${userId}/hq`, { token, signal }),
  /** Sets the HQ and ends the previous one. */
  set: (token: string, userId: string, hqId: string) =>
    request<UserHqAssignmentDto>(`/territory/users/${userId}/hq`, { method: 'PUT', token, body: { hqId } }),
};

/** What the routes list of one employee returns (the API's RouteSummary). */
export interface UserRouteDto {
  id: string;
  name: string;
  hqId: string;
  hqName: string;
  routeType: string;
  distanceKm: string | null;
  status: TerritoryStatus;
}

/** The active routes one field employee covers. Admin and HR read; assigning and removing stay on the route endpoints (Admin). */
export const userRoutesApi = {
  list: (token: string, userId: string, signal?: AbortSignal) =>
    request<UserRouteDto[]>(`/territory/users/${userId}/routes`, { token, signal }),
};

/** Who can be an employee's manager (higher designation, covering their HQ), and the HQs and Zones a manager covers. Admin and HR; the Accountant may read candidates. */
export const managerApi = {
  candidates: (token: string, query: { level: number; hqId?: string; search?: string; excludeUserId?: string }, signal?: AbortSignal) => {
    const params = new URLSearchParams({ level: String(query.level) });
    if (query.hqId) params.set('hqId', query.hqId);
    if (query.search) params.set('search', query.search);
    if (query.excludeUserId) params.set('excludeUserId', query.excludeUserId);
    return request<ManagerCandidateDto[]>(`/territory/manager-candidates?${params}`, { token, signal });
  },
  coverage: (token: string, userId: string, signal?: AbortSignal) => request<ManagerCoverageDto>(`/territory/users/${userId}/coverage`, { token, signal }),
  teamGap: (token: string, userId: string, signal?: AbortSignal) => request<TerritoryGapDto | null>(`/territory/users/${userId}/team-gaps`, { token, signal }),
  teamGaps: (token: string, signal?: AbortSignal) => request<TerritoryGapDto[]>('/territory/team-gaps', { token, signal }),
  extendTerritory: (token: string, userId: string, body: ExtendManagerTerritoryDto) => request<unknown>(`/territory/users/${userId}/extend-territory`, { method: 'POST', token, body }),
  setCoverage: (token: string, userId: string, body: SetManagerCoverageDto) => request<ManagerCoverageDto>(`/territory/users/${userId}/coverage`, { method: 'PUT', token, body }),
};

export type TerritorySegment = 'zones' | 'hqs' | 'routes';

/** Permanent delete of a Zone, HQ or Route with everything under it (Admin): `impact` first, to show what it would take and touch. */
export const territoryDeleteApi = {
  impact: (token: string, segment: TerritorySegment, id: string, signal?: AbortSignal) =>
    request<TerritoryDeleteImpactDto>(`/territory/${segment}/${id}/delete-impact`, { token, signal }),
  remove: (token: string, segment: TerritorySegment, id: string) =>
    request<TerritoryDeleteResultDto>(`/territory/${segment}/${id}`, { method: 'DELETE', token }),
};
