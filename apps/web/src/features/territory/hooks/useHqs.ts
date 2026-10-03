'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/allPages';
import { hqsApi, type ListHqsQuery } from '@/lib/api/endpoints/territory';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export function useHqs(query?: ListHqsQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.hqs.list(query),
      fetch: (token, signal) => hqsApi.list(token, query, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

/**
 * Every HQ, all pages — for naming one from a Route (there is no read-one endpoint) and for its base place.
 * Shares the directory's query key, so it costs nothing when the directory is already loaded.
 */
export function useAllHqs() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.hqs.directory(),
      fetch: (token, signal) =>
        fetchAllPages((page) => hqsApi.list(token, { page, pageSize: MAX_PAGE_SIZE }, signal)).then((r) => r.items),
      staleTime: staleTime.configuration,
    }),
  );
}
