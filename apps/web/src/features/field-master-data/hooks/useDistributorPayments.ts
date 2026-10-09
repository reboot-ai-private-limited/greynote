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
    invalidates: [keys.distributorPayments.all()],
    successMessage: 'Payment recorded.',
    onSuccess: onDone,
  });
}

export function useCancelPayment(onDone: () => void) {
  return useApiMutation<{ id: string; reason: string }, DistributorPaymentDto>({
    call: (token, { id, reason }) => salesApi.cancelPayment(token, id, reason),
    invalidates: [keys.distributorPayments.all()],
    successMessage: 'Payment cancelled.',
    onSuccess: onDone,
  });
}
