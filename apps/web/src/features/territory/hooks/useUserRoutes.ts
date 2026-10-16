'use client';

import { useQuery } from '@tanstack/react-query';
import { userRoutesApi } from '@/lib/api/endpoints/territory';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

/** The active routes one employee covers. Under `routes.all`, so any assign or unassign refreshes it. */
export function useUserRoutes(userId: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.routes.forUser(userId),
      fetch: (token, signal) => userRoutesApi.list(token, userId, signal),
      staleTime: staleTime.live,
    }),
  );
}
