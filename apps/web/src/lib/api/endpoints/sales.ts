import type { MissingStockRowDto } from '@greynote/contracts';
import { request } from '../client';

export const salesApi = {
  /** ADMIN only (HR and Accountant get 403). `month` is `YYYY-MM`. */
  missingStock: (token: string, query: { month: string }, signal?: AbortSignal) =>
    request<MissingStockRowDto[]>('/sales/monthly-stock/missing', { token, query: { ...query }, signal }),

  /** `PLACED` → `DONE`, by the MR who placed it or Admin; a second call is a 409. */
  completeOrder: (token: string, id: string) => request<{ id: string; status: string }>(`/sales/orders/${id}/complete`, { method: 'POST', token }),
  /** `PLACED` → `CANCELLED`, by the MR who placed it or Admin. */
  cancelOrder: (token: string, id: string) => request<{ id: string; status: string }>(`/sales/orders/${id}/cancel`, { method: 'POST', token }),
};
