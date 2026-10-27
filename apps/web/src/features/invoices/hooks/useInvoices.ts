'use client';

import type { InvoiceStatus } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { salesApi } from '@/lib/api/endpoints/sales';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export interface InvoicesQuery {
  distributorId?: string;
  status?: InvoiceStatus;
  from?: string;
  to?: string;
}

/** Invoices with paid and due. Live: an order is marked Done or a payment is recorded or cancelled. */
export function useInvoices(query: InvoicesQuery, enabled = true) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.invoices.list(query),
      fetch: (token, signal) => salesApi.invoices(token, query, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

export function useInvoice(orderId: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.invoices.detail(orderId),
      fetch: (token, signal) => salesApi.invoice(token, orderId, signal),
      staleTime: staleTime.live,
    }),
  );
}
