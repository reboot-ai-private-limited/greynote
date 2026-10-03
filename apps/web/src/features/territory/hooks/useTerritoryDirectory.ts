'use client';

import type { PaginatedDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/allPages';
import { hqsApi, routesApi, zonesApi } from '@/lib/api/endpoints/territory';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { buildTerritoryDirectory } from '../lib/directory';

const all = <T,>(read: (token: string, page: number, signal: AbortSignal) => Promise<PaginatedDto<T>>) =>
  (token: string, signal: AbortSignal) => fetchAllPages((page) => read(token, page, signal)).then((r) => r.items);

/**
 * Every Zone, HQ and Route, for a label ("HQ · Route") or a picker. Other modules'
 * screens read this rather than a paged list, because a page of 100 silently drops the rest.
 */
export function useTerritoryDirectory() {
  const options = { staleTime: staleTime.configuration } as const;
  const zones = useQuery(
    authedQueryOptions({
      queryKey: keys.zones.directory(),
      fetch: all((token, page, signal) => zonesApi.list(token, { page, pageSize: MAX_PAGE_SIZE }, signal)),
      ...options,
    }),
  );
  const hqs = useQuery(
    authedQueryOptions({
      queryKey: keys.hqs.directory(),
      fetch: all((token, page, signal) => hqsApi.list(token, { page, pageSize: MAX_PAGE_SIZE }, signal)),
      ...options,
    }),
  );
  const routes = useQuery(
    authedQueryOptions({
      queryKey: keys.routes.directory(),
      fetch: all((token, page, signal) => routesApi.list(token, { page, pageSize: MAX_PAGE_SIZE }, signal)),
      ...options,
    }),
  );

  const directory = useMemo(
    () =>
      buildTerritoryDirectory({
        zones: zones.data ?? [],
        hqs: hqs.data ?? [],
        routes: routes.data ?? [],
      }),
    [zones.data, hqs.data, routes.data],
  );

  return {
    ...directory,
    isLoading: zones.isLoading || hqs.isLoading || routes.isLoading,
    error: zones.error ?? hqs.error ?? routes.error,
  };
}
