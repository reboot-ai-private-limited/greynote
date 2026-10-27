'use client';

import type { DistributorPaymentDto, RecordDistributorPaymentDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { salesApi } from '@/lib/api/endpoints/sales';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export interface DistributorRangeQuery {
  distributorId: string;
  from: string;
  to: string;
}

export function useDistributorPayments(query: DistributorRangeQuery, enabled = true) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.distributorPayments.list(query),
      fetch: (token, signal) => salesApi.distributorPayments(token, query, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

/** What each distributor paid in a range, keyed by distributor id; one with nothing recorded is absent. Refreshes whenever a payment is recorded or cancelled. */
export function useDistributorPaymentTotals(range: { from: string; to: string }) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.distributorPayments.totals(range),
      fetch: async (token, signal) =>
        new Map(
          (await salesApi.distributorPaymentTotals(token, range, signal)).map((t) => [
            t.distributorId,
            t.collectedPaise,
          ]),
        ),
      staleTime: staleTime.live,
    }),
  );
}

/** Each distributor's delivered and collected, all time, keyed by distributor id. Refreshes when a payment is recorded or cancelled, or an order is marked Done. */
export function useDistributorBalances() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.distributorPayments.balances(),
      fetch: async (token, signal) => new Map((await salesApi.distributorBalances(token, signal)).map((b) => [b.distributorId, b])),
      staleTime: staleTime.live,
    }),
  );
}

/** What all distributors owe together, all time. Refreshes with the balances. */
export function useDistributorOutstanding() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.distributorPayments.outstanding(),
      fetch: (token, signal) => salesApi.distributorOutstanding(token, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useDistributorOrders(query: DistributorRangeQuery, enabled = true) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.distributorPayments.orders(query),
      fetch: (token, signal) => salesApi.distributorOrders(token, query, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

export function useRecordPayment(onDone: () => void) {
  return useApiMutation<RecordDistributorPaymentDto, DistributorPaymentDto>({
    call: (token, body) => salesApi.recordPayment(token, body),
    invalidates: [keys.distributorPayments.all(), keys.invoices.all()],
    successMessage: 'Payment recorded.',
    onSuccess: onDone,
  });
}

export function useCancelPayment(onDone: () => void) {
  return useApiMutation<{ id: string; reason: string }, DistributorPaymentDto>({
    call: (token, { id, reason }) => salesApi.cancelPayment(token, id, reason),
    invalidates: [keys.distributorPayments.all(), keys.invoices.all()],
    successMessage: 'Payment cancelled.',
    onSuccess: onDone,
  });
}
