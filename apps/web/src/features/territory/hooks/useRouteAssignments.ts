'use client';

import { useQuery } from '@tanstack/react-query';
import { assignmentsApi } from '@/lib/api/endpoints/territory';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

/** Active assignments, or the full history (the API keeps unassigned rows) when `includeHistory`. */
export function useRouteAssignments(routeId: string, includeHistory: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.routes.assignments(routeId, includeHistory),
      fetch: (token, signal) => assignmentsApi.list(token, routeId, includeHistory ? undefined : 'active', signal),
      staleTime: staleTime.live,
    }),
  );
}
