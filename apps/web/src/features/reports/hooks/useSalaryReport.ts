'use client';

import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/lib/api/endpoints/reports';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export function useSalaryYear(year: number) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.salaryYear(year),
      fetch: (token, signal) => reportsApi.salaryYear(token, { year }, signal),
      staleTime: staleTime.live,
    }),
  );
}
