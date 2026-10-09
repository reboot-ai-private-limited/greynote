'use client';

import { useQuery } from '@tanstack/react-query';
import {
  marketingApi,
  type SetAchievementBody,
  type SetTargetBody,
} from '@/lib/api/endpoints/marketing';
import { reportsApi, type SalesDashboardQuery } from '@/lib/api/endpoints/reports';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

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

/** Saves whichever of the two figures were filled in; the dashboard is re-read once both have settled. */
export function useSaveMonthFigures(onDone: () => void) {
  return useApiMutation<{ target?: SetTargetBody; achievement?: SetAchievementBody }>({
    call: async (token, { target, achievement }) => {
      if (target) await marketingApi.setTarget(token, target);
      if (achievement) await marketingApi.setAchievement(token, achievement);
    },
    invalidates: [keys.reports.all()],
    successMessage: 'Saved.',
    onSuccess: onDone,
  });
}
