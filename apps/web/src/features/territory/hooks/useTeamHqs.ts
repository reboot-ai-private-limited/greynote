'use client';

import { useQuery } from '@tanstack/react-query';
import { userRoutesApi } from '@/lib/api/endpoints/territory';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

/** A person's own HQ and their team's HQs (2026-11-28): who is based in each, and its active routes. Under `routes.all`. */
export function useTeamHqs(userId: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.routes.teamHqs(userId),
      fetch: async (token, signal) => (await userRoutesApi.teamHqs(token, userId, signal)).hqs,
      staleTime: staleTime.live,
    }),
  );
}
