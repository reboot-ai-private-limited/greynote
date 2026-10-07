import type { OrdersReportDto, ReportOrderDetailDto, SalesStatementDto, SalesYearReportDto, StockReportDto } from '@greynote/contracts';
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

  /** The twelve months of a financial year (the year it starts in): primary and secondary for the chart. */
  salesYear: (token: string, query: { year: number; distributorId?: string | undefined; productId?: string | undefined }, signal?: AbortSignal) =>
    request<SalesYearReportDto>('/reports/sales', { token, query: { ...query }, signal }),
  /** One month's stock and sales statement per distributor and product. */
  salesStatement: (token: string, query: { month: string; distributorId?: string | undefined; productId?: string | undefined }, signal?: AbortSignal) =>
    request<SalesStatementDto>('/reports/sales/statement', { token, query: { ...query }, signal }),
  stock: (token: string, query: { month: string }, signal?: AbortSignal) => request<StockReportDto>('/reports/stock', { token, query: { ...query }, signal }),
};
