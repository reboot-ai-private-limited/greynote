'use client';

import type { GenerateOutcomeDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { payrollApi } from '@/lib/api/endpoints/payroll';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** One month's sheet: a bare array of at most 1000 runs, each with the employee's name and code. */
export function usePayrollMonth(month: string, enabled: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.payroll.month({ month }),
      fetch: (token, signal) => payrollApi.list(token, { month }, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

/** One employee asked for by name that is already finalized is a 409; in a batch it is that employee's skipped line. */
export function useGenerate(onResult: (outcomes: GenerateOutcomeDto[]) => void) {
  return useApiMutation<{ month: string; userIds?: string[] }, GenerateOutcomeDto[]>({
    call: (token, body) => payrollApi.generate(token, body),
    invalidates: [keys.payroll.all()],
    onSuccess: onResult,
  });
}
