'use client';

import { useQuery } from '@tanstack/react-query';
import { reportsApi, type CallPerformanceQuery } from '@/lib/api/endpoints/reports';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

/** Call average and coverage per employee over whole months (2026-11-27). */
export function useCallPerformance(query: CallPerformanceQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.callPerformance(query),
      fetch: (token, signal) => reportsApi.callPerformance(token, query, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** The doctors an employee (a manager: their team) holds that got no call in the period. */
export function useMissedDoctors(userId: string | null, fromMonth: string, toMonth: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.callPerformanceMissed(userId ?? '', fromMonth, toMonth),
      fetch: (token, signal) => reportsApi.callPerformanceMissed(token, userId!, { fromMonth, toMonth }, signal),
      staleTime: staleTime.live,
      enabled: userId !== null,
    }),
  );
}
