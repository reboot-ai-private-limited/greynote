'use client';

import type { AdjustPayrollAmountDto, GenerateOutcomeDto, OverridePayrollDayDto, PayPayrollDto, PayrollRunDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { payrollApi } from '@/lib/api/endpoints/payroll';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import { finalizeRuns, type FinalizeResult } from '../lib/payroll';

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

/** Missing ESI/EPF numbers for a month, read live, so adding a number clears the warning. Never blocks anything. */
export function usePayrollWarnings(month: string, enabled: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.payroll.warnings(month),
      fetch: (token, signal) => payrollApi.warnings(token, month, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

/** The company total of salary marked paid, by month, for the year in view. */
export function usePaidTotals(enabled: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.payroll.paidTotals(),
      fetch: (token, signal) => payrollApi.paidTotals(token, signal),
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

/** One run, for its own page. */
export function usePayrollRun(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.payroll.detail(id),
      fetch: (token, signal) => payrollApi.get(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

/**
 * Finalizes each draft on its own: one request each, so a run that is already final (a second tab) is a refusal for that row
 * alone. It never throws on a refused row; the caller gets which were finalized and which were not.
 */
export function useFinalize(onResult: (result: FinalizeResult) => void) {
  return useApiMutation<string[], FinalizeResult>({
    call: (token, ids) => finalizeRuns((id) => payrollApi.finalize(token, id), ids),
    invalidates: [keys.payroll.all()],
    onSuccess: onResult,
  });
}

/** HR charges a day differently from the rules, on a draft; the run and the sheet refetch. */
export function useOverrideDay(runId: string, onDone: () => void) {
  return useApiMutation<OverridePayrollDayDto, PayrollRunDto>({
    call: (token, body) => payrollApi.overrideDay(token, runId, body),
    invalidates: [keys.payroll.all()],
    successMessage: 'The day was changed.',
    onSuccess: onDone,
  });
}

/** HR adds or takes off an amount on a draft. */
export function useAdjustAmount(runId: string, onDone: () => void) {
  return useApiMutation<AdjustPayrollAmountDto, PayrollRunDto>({
    call: (token, body) => payrollApi.adjustAmount(token, runId, body),
    invalidates: [keys.payroll.all()],
    successMessage: 'The amount was added.',
    onSuccess: onDone,
  });
}

/** The Accountant marks a finalized run's salary paid. */
export function usePayRun(runId: string, onDone: () => void) {
  return useApiMutation<PayPayrollDto, PayrollRunDto>({
    call: (token, body) => payrollApi.pay(token, runId, body),
    invalidates: [keys.payroll.all()],
    successMessage: 'The salary was marked paid.',
    onSuccess: onDone,
  });
}
