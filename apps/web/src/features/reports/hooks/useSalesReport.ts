'use client';

import { useQuery } from '@tanstack/react-query';
import { reportsApi, type SalesWindowQuery } from '@/lib/api/endpoints/reports';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export interface SalesFilters {
  distributorId?: string | undefined;
  productId?: string | undefined;
}

/** The financial year's twelve months for the chart. */
export function useSalesYear(year: number, filters: SalesFilters) {
  const query = { year, ...(filters.distributorId && { distributorId: filters.distributorId }), ...(filters.productId && { productId: filters.productId }) };
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.salesYear(query),
      fetch: (token, signal) => reportsApi.salesYear(token, query, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useSalesStatement(month: string, filters: SalesFilters) {
  const query = { month, ...(filters.distributorId && { distributorId: filters.distributorId }), ...(filters.productId && { productId: filters.productId }) };
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.salesStatement(query),
      fetch: (token, signal) => reportsApi.salesStatement(token, query, signal),
      staleTime: staleTime.live,
      enabled: month !== '',
    }),
  );
}

export function useStockReport(month: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.stock(month),
      fetch: (token, signal) => reportsApi.stock(token, { month }, signal),
      staleTime: staleTime.live,
      enabled: month !== '',
    }),
  );
}

const breakdown = { staleTime: staleTime.live };

export function useSalesByProduct(window: SalesWindowQuery, distributorId?: string) {
  const query = { ...window, ...(distributorId && { distributorId }) };
  return useQuery(authedQueryOptions({ queryKey: keys.reports.salesBreakdown('product', query), fetch: (token, signal) => reportsApi.salesByProduct(token, query, signal), ...breakdown }));
}

export function useSalesByDistributor(window: SalesWindowQuery, productId?: string) {
  const query = { ...window, ...(productId && { productId }) };
  return useQuery(authedQueryOptions({ queryKey: keys.reports.salesBreakdown('distributor', query), fetch: (token, signal) => reportsApi.salesByDistributor(token, query, signal), ...breakdown }));
}

export function useSalesByEmployee(window: SalesWindowQuery, search?: string) {
  const query = { ...window, ...(search && { search }) };
  return useQuery(authedQueryOptions({ queryKey: keys.reports.salesBreakdown('employee', query), fetch: (token, signal) => reportsApi.salesByEmployee(token, query, signal), ...breakdown }));
}
