'use client';

import { useQuery } from '@tanstack/react-query';
import { areasApi, type ListAreasQuery } from '@/lib/api/endpoints/territory';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export function useAreas(query?: ListAreasQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.areas.list(query),
      fetch: (token, signal) => areasApi.list(token, query, signal),
      staleTime: staleTime.configuration,
    }),
  );
}
