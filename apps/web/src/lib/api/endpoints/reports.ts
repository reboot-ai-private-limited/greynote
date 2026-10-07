import type { OrdersReportDto, ReportOrderDetailDto } from '@greynote/contracts';
import { request } from '../client';

export interface OrdersReportQuery {
  /** `YYYY-MM`, inside the financial year in view. */
  month: string;
  type?: 'DISTRIBUTOR' | 'CHEMIST' | undefined;
  status?: 'PLACED' | 'DONE' | 'CANCELLED' | undefined;
  mrId?: string | undefined;
}

export const reportsApi = {
  /** Admin only. A month of orders by order date, with names and totals by status. */
  orders: (token: string, query: OrdersReportQuery, signal?: AbortSignal) => request<OrdersReportDto>('/reports/orders', { token, query: { ...query }, signal }),
  order: (token: string, id: string, signal?: AbortSignal) => request<ReportOrderDetailDto>(`/reports/orders/${id}`, { token, signal }),
};
