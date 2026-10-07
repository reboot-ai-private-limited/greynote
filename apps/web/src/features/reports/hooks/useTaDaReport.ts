'use client';

import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/lib/api/endpoints/reports';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export function useTaDaYear(year: number) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.taDaYear(year),
      fetch: (token, signal) => reportsApi.taDaYear(token, { year }, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** One employee's days in a month; asked for only once the dialog is open. */
export function useTaDaDays(userId: string, month: string, enabled: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.taDaDays(userId, month),
      fetch: (token, signal) => reportsApi.taDaDays(token, { userId, month }, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}
