'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/allPages';
import { zonesApi, type ListZonesQuery } from '@/lib/api/endpoints/territory';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export function useZones(query?: ListZonesQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.zones.list(query),
      fetch: (token, signal) => zonesApi.list(token, query, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

/** Every Zone, all pages — for a picker. Shares the directory's query key, so it is free when the directory is loaded. */
export function useAllZones() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.zones.directory(),
      fetch: (token, signal) => fetchAllPages((page) => zonesApi.list(token, { page, pageSize: MAX_PAGE_SIZE }, signal)).then((r) => r.items),
      staleTime: staleTime.configuration,
    }),
  );
}
