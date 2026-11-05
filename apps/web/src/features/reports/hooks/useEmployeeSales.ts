'use client';

import type { SecondaryAttachmentDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { marketingApi, type SetTargetBody, type UpdateTargetBody } from '@/lib/api/endpoints/marketing';
import { reportsApi, type EmployeeSalesQuery } from '@/lib/api/endpoints/reports';
import { salesApi, type EditSecondaryStockBody } from '@/lib/api/endpoints/sales';
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

/** Whatever was saved changes the grid, the employee's report and the dashboard, which all read the same figures. */
const refreshes = [keys.employeeMonth.all(), keys.reports.all()];

/** One file at a time; the caller loops, so a long pick uploads in order and a bad file does not stop the good ones. */
export function useAddSecondaryFile() {
  return useApiMutation<FormData, SecondaryAttachmentDto>({
    call: (token, body) => salesApi.addSecondaryFile(token, body),
    invalidates: refreshes,
  });
}

/** A manager corrects the figures an MR sent; the approval card and the reports read the same figures, so all refresh. */
export function useEditSecondaryStock(onDone: () => void) {
  return useApiMutation<EditSecondaryStockBody, { changed: number }>({
    call: (token, body) => salesApi.editSecondaryStock(token, body),
    invalidates: [...refreshes, keys.approvals.all()],
    successMessage: 'Figures corrected.',
    onSuccess: onDone,
  });
}

export function useRemoveSecondaryFile() {
  return useApiMutation<string, null>({
    call: (token, id) => salesApi.removeSecondaryFile(token, id),
    invalidates: refreshes,
    successMessage: 'File removed.',
  });
}

/** Admin deletes an employee's month of secondary sales, its files and the approval request, so the approvals lists change too. */
export function useDeleteSecondaryMonth(onDone: () => void) {
  return useApiMutation<{ userId: string; month: string }, { distributors: number; lines: number; files: number; requestRemoved: boolean }>({
    call: (token, body) => salesApi.deleteSecondaryMonth(token, body),
    invalidates: [...refreshes, keys.approvals.all()],
    successMessage: 'Month deleted.',
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

export function useUpdateTarget(onDone: () => void) {
  return useApiMutation<{ id: string; body: UpdateTargetBody }>({
    call: (token, { id, body }) => marketingApi.updateTarget(token, id, body),
    invalidates: [keys.reports.all()],
    successMessage: 'Target changed.',
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
