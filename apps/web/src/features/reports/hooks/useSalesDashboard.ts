'use client';

import { useQuery } from '@tanstack/react-query';
import { reportsApi, type SalesDashboardQuery } from '@/lib/api/endpoints/reports';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export function useSalesDashboard(query: SalesDashboardQuery, enabled = true) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.salesDashboard(query),
      fetch: (token, signal) => reportsApi.salesDashboard(token, query, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}
