'use client';

import { useQuery } from '@tanstack/react-query';
import { hrApi, type ListLeavesQuery } from '@/lib/api/endpoints/hr';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

/** Everyone's leaves, newest first. Other people submit and decide them, so it is not held fresh. */
export function useAllLeaves(query: ListLeavesQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.leaves.all(query),
      fetch: (token, signal) => hrApi.allLeaves(token, query, signal),
      staleTime: staleTime.live,
    }),
  );
}
