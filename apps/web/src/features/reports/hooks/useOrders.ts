'use client';

import { useQuery } from '@tanstack/react-query';
import { reportsApi, type OrdersReportQuery } from '@/lib/api/endpoints/reports';
import { salesApi } from '@/lib/api/endpoints/sales';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** A month of orders. Live: an MR places one or finishes one. */
export function useOrdersReport(query: OrdersReportQuery, enabled = true) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.orders(query),
      fetch: (token, signal) => reportsApi.orders(token, query, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

export function useOrderDetail(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.order(id),
      fetch: (token, signal) => reportsApi.order(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** Done or Cancelled, once. Both refresh every report, since primary moves when an order is Done. */
export function useFinishOrder(to: 'DONE' | 'CANCELLED', onDone: () => void) {
  return useApiMutation<string>({
    call: (token, id) => (to === 'DONE' ? salesApi.completeOrder(token, id) : salesApi.cancelOrder(token, id)).then(() => undefined),
    invalidates: [keys.reports.all()],
    successMessage: to === 'DONE' ? 'The order is marked Done.' : 'The order is cancelled.',
    onSuccess: onDone,
  });
}
