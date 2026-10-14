'use client';

import { useQuery } from '@tanstack/react-query';
import { reportsApi, type OrdersReportQuery } from '@/lib/api/endpoints/reports';
import { salesApi } from '@/lib/api/endpoints/sales';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import type { CompleteOrderDto, EditOrderDto, PlaceOrderForDto } from '@greynote/contracts';

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

/** Admin or the Accountant adds an order for a field employee; every report moves with it. */
export function useAddOrder(onDone: () => void) {
  return useApiMutation<PlaceOrderForDto>({
    call: (token, body) => salesApi.placeOrderFor(token, body).then(() => undefined),
    invalidates: [keys.reports.all()],
    successMessage: 'The order was added.',
    onSuccess: onDone,
  });
}

/** Changes a PLACED order's lines and remarks. */
export function useEditOrder(id: string, onDone: () => void) {
  return useApiMutation<EditOrderDto>({
    call: (token, body) => salesApi.editOrder(token, id, body).then(() => undefined),
    invalidates: [keys.reports.all()],
    successMessage: 'The order was changed.',
    onSuccess: onDone,
  });
}

/** Marks a distributor order Done with what was supplied and given free (Admin or the Accountant); primary counts the supplied part. */
export function useCompleteOrder(id: string, onDone: () => void) {
  return useApiMutation<CompleteOrderDto>({
    call: (token, body) => salesApi.completeOrder(token, id, body).then(() => undefined),
    invalidates: [keys.reports.all(), keys.distributorPayments.all()],
    successMessage: 'The order is marked Done.',
    onSuccess: onDone,
  });
}
