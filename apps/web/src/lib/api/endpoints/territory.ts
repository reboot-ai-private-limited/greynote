import type { PaginatedDto, PaginationQueryDto, TerritoryStatus, ZoneDto } from '@greynote/contracts';
import { request } from '../client';

export interface ListZonesQuery extends PaginationQueryDto {
  status?: TerritoryStatus | undefined;
}

export const zonesApi = {
  list: (token: string, query: ListZonesQuery | undefined, signal?: AbortSignal) =>
    request<PaginatedDto<ZoneDto>>('/territory/zones', {
      token,
      ...(query === undefined ? {} : { query: { ...query } }),
      signal,
    }),
};
