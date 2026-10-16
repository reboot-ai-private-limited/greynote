'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/allPages';
import { routesApi, type ListRoutesQuery } from '@/lib/api/endpoints/territory';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export function useRoutes(query?: ListRoutesQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.routes.list(query),
      fetch: (token, signal) => routesApi.list(token, query, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function useRoute(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.routes.detail(id),
      fetch: (token, signal) => routesApi.get(token, id, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

/** Every active route (all pages), or just those under one HQ: for the pickers that add routes to an MR. Its own keys, apart from the directory that also lists inactive routes. */
export function useActiveRoutes(hqId?: string, enabled = true) {
  const query = { status: 'active' as const, ...(hqId && { hqId }) };
  return useQuery(
    authedQueryOptions({
      queryKey: keys.routes.list({ ...query, all: true }),
      fetch: (token, signal) => fetchAllPages((page) => routesApi.list(token, { ...query, page, pageSize: MAX_PAGE_SIZE }, signal)).then((r) => r.items),
      staleTime: staleTime.configuration,
      enabled,
    }),
  );
}
