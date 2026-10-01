import type {
  AreaDto,
  AreaType,
  CreateAreaDto,
  CreateHqDto,
  CreateRouteDto,
  CreateZoneDto,
  HqDto,
  PaginatedDto,
  PaginationQueryDto,
  PlaceCandidateDto,
  RouteAssignmentDto,
  RouteDto,
  TerritoryStatus,
  UpdateAreaDto,
  UpdateHqDto,
  UpdateRouteDto,
  UpdateWaypointsDto,
  UpdateZoneDto,
  ZoneDto,
} from '@greynote/contracts';
import { request } from '../client';

export interface ListZonesQuery extends PaginationQueryDto {
  status?: TerritoryStatus | undefined;
}
export interface ListHqsQuery extends ListZonesQuery {
  zoneId?: string | undefined;
}
export interface ListAreasQuery extends ListZonesQuery {
  hqId?: string | undefined;
  type?: AreaType | undefined;
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
  update: (token: string, id: string, body: UpdateHqDto) =>
    request<HqDto>(`/territory/hqs/${id}`, { method: 'PATCH', token, body }),
};

export const areasApi = {
  list: (token: string, query: ListAreasQuery | undefined, signal?: AbortSignal) =>
    request<PaginatedDto<AreaDto>>('/territory/areas', { token, ...(query && { query: { ...query } }), signal }),
  create: (token: string, body: CreateAreaDto) =>
    request<AreaDto>('/territory/areas', { method: 'POST', token, body }),
  update: (token: string, id: string, body: UpdateAreaDto) =>
    request<AreaDto>(`/territory/areas/${id}`, { method: 'PATCH', token, body }),
};

export interface ListRoutesQuery extends ListZonesQuery {
  areaId?: string | undefined;
  hqId?: string | undefined;
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
  saveWaypoints: (token: string, id: string, body: UpdateWaypointsDto) =>
    request<RouteDto>(`/territory/routes/${id}/waypoints`, { method: 'PATCH', token, body }),
  /** Manual distance override. `distanceKm` is a positive string with at most 2 decimals. */
  setDistance: (token: string, id: string, distanceKm: string) =>
    request<RouteDto>(`/territory/routes/${id}/distance`, { method: 'PATCH', token, body: { distanceKm } }),
  recalculate: (token: string, id: string) =>
    request<RouteDto>(`/territory/routes/${id}/recalculate`, { method: 'POST', token }),
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
