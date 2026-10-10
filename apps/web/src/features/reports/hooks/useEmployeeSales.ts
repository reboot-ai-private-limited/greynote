'use client';

import type { EmployeeSalesDto, SaveEmployeePrimaryDto, SaveEmployeeSecondaryDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { marketingApi, type SetTargetBody } from '@/lib/api/endpoints/marketing';
import { reportsApi, type EmployeeSalesQuery } from '@/lib/api/endpoints/reports';
import { salesApi } from '@/lib/api/endpoints/sales';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useEmployeeSalesReport(query: EmployeeSalesQuery, enabled = true) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.reports.employeeSales(query),
      fetch: (token, signal) => reportsApi.employeeSales(token, query, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

/** One month by product, for the entry grid. */
export function useEmployeeMonth(userId: string, month: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.employeeMonth.month(userId, month),
      fetch: (token, signal) => salesApi.employeeSales(token, { userId, month }, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** Whatever was saved changes the grid, the employee's report and the dashboard, which all read the same figures. */
const refreshes = [keys.employeeMonth.all(), keys.reports.all()];

export function useSaveSecondary(onDone: () => void) {
  return useApiMutation<SaveEmployeeSecondaryDto, { added: number; changed: number }>({
    call: (token, body) => salesApi.saveEmployeeSecondary(token, body),
    invalidates: refreshes,
    successMessage: 'Secondary saved.',
    onSuccess: onDone,
  });
}

export function useSavePrimary(onDone: () => void) {
  return useApiMutation<SaveEmployeePrimaryDto, { added: number; changed: number }>({
    call: (token, body) => salesApi.saveEmployeePrimary(token, body),
    invalidates: refreshes,
    successMessage: 'Primary saved.',
    onSuccess: onDone,
  });
}

export function useSetTarget(onDone: () => void) {
  return useApiMutation<SetTargetBody>({
    call: (token, body) => marketingApi.setTarget(token, body),
    invalidates: [keys.reports.all()],
    successMessage: 'Target saved.',
    onSuccess: onDone,
  });
}

export function useDeleteTarget(onDone: () => void) {
  return useApiMutation<string>({
    call: (token, id) => marketingApi.deleteTarget(token, id),
    invalidates: [keys.reports.all()],
    successMessage: 'Target removed.',
    onSuccess: onDone,
  });
}

export type { EmployeeSalesDto };
