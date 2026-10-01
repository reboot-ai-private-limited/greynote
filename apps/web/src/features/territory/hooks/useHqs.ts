'use client';

import { useQuery } from '@tanstack/react-query';
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
