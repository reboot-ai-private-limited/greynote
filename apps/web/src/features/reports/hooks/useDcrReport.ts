'use client';

import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/lib/api/endpoints/reports';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export function useDcrYear(year: number) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.dcrYear(year),
      fetch: (token, signal) => reportsApi.dcrYear(token, { year }, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** One employee's coverage for a month; asked for only once the dialog is open. */
export function useDcrCoverage(userId: string, month: string, enabled: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.dcrCoverage(userId, month),
      fetch: (token, signal) => reportsApi.dcrCoverage(token, { userId, month }, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

/** Each doctor's visit frequency against the calls made in a month; one employee's, or everyone's when `userId` is omitted. */
export function useDoctorVisits(month: string, userId?: string, enabled = true) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.doctorVisits(userId, month),
      fetch: (token, signal) => reportsApi.doctorVisits(token, { month, userId }, signal),
      staleTime: staleTime.live,
      enabled: enabled && month !== '',
    }),
  );
}
