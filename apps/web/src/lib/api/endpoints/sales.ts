import type { DistributorPaymentDto, DistributorPaymentsDto, DistributorPaymentTotalDto, MissingStockRowDto, RecordDistributorPaymentDto } from '@greynote/contracts';
import { request } from '../client';

/** One order as `GET /sales/orders` returns it; the distributor's Orders tab shows only these fields. */
export interface DistributorOrderRow {
  id: string;
  userId: string;
  orderDate: string;
  status: 'PLACED' | 'DONE' | 'CANCELLED';
  totalAmountPaise: number;
  remarks: string | null;
  items: unknown[];
}

export const salesApi = {
  /** Admin or Accountant. One distributor's payments in a range (both ends inclusive), with the collected and ordered totals. */
  distributorPayments: (token: string, query: { distributorId: string; from: string; to: string }, signal?: AbortSignal) =>
    request<DistributorPaymentsDto>('/sales/distributor-payments', { token, query: { ...query }, signal }),
  /** Admin or Accountant. What each distributor paid in a range (recorded payments only); distributors with none are left out. */
  distributorPaymentTotals: (token: string, query: { from: string; to: string }, signal?: AbortSignal) =>
    request<DistributorPaymentTotalDto[]>('/sales/distributor-payments/totals', { token, query: { ...query }, signal }),
  recordPayment: (token: string, body: RecordDistributorPaymentDto) => request<DistributorPaymentDto>('/sales/distributor-payments', { method: 'POST', token, body }),
  cancelPayment: (token: string, id: string, reason: string) => request<DistributorPaymentDto>(`/sales/distributor-payments/${id}/cancel`, { method: 'POST', token, body: { reason } }),
  /** A distributor's orders in a range, newest first, whoever placed them (Admin). */
  distributorOrders: (token: string, query: { distributorId: string; from: string; to: string }, signal?: AbortSignal) =>
    request<DistributorOrderRow[]>('/sales/orders', { token, query: { outletType: 'DISTRIBUTOR', outletId: query.distributorId, from: query.from, to: query.to }, signal }),

  /** ADMIN only (HR and Accountant get 403). `month` is `YYYY-MM`. */
  missingStock: (token: string, query: { month: string }, signal?: AbortSignal) =>
    request<MissingStockRowDto[]>('/sales/monthly-stock/missing', { token, query: { ...query }, signal }),

  /** `PLACED` → `DONE`, by the MR who placed it or Admin; a second call is a 409. */
  completeOrder: (token: string, id: string) => request<{ id: string; status: string }>(`/sales/orders/${id}/complete`, { method: 'POST', token }),
  /** `PLACED` → `CANCELLED`, by the MR who placed it or Admin. */
  cancelOrder: (token: string, id: string) => request<{ id: string; status: string }>(`/sales/orders/${id}/cancel`, { method: 'POST', token }),
};
