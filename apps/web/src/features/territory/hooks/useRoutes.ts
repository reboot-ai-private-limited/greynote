'use client';

import { useQuery } from '@tanstack/react-query';
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
