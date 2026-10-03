'use client';

import { useQuery } from '@tanstack/react-query';
import { fieldActivityApi } from '@/lib/api/endpoints/fieldActivity';
import { hrApi } from '@/lib/api/endpoints/hr';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

/** The leave a request is about, as it was counted when submitted. */
export function useLeave(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.leaves.detail(id),
      fetch: (token, signal) => hrApi.leave(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** The submitter's balances for the leave's own year, so the decision sees what it spends. */
export function useLeaveBalances(userId: string | undefined, year: number | undefined) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.leaves.balances(userId ?? '', year),
      fetch: (token, signal) => hrApi.balances(token, userId ?? '', year, signal),
      staleTime: staleTime.live,
      enabled: Boolean(userId) && year !== undefined,
    }),
  );
}

/** The daily report under review, with every call, follow-up and expense. */
export function useDcr(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.dcr.detail(id),
      fetch: (token, signal) => fieldActivityApi.dcr(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}
