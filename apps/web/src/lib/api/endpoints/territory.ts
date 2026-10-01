import type {
  AreaDto,
  AreaType,
  CreateAreaDto,
  CreateHqDto,
  CreateZoneDto,
  HqDto,
  PaginatedDto,
  PaginationQueryDto,
  TerritoryStatus,
  UpdateAreaDto,
  UpdateHqDto,
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
