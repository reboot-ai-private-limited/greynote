'use client';

import type { AmendMonthlyPlanDto, MonthlyPlanDetailDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { fieldActivityApi } from '@/lib/api/endpoints/fieldActivity';
import { hrApi } from '@/lib/api/endpoints/hr';
import { planningApi } from '@/lib/api/endpoints/planning';
import { salesApi } from '@/lib/api/endpoints/sales';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** The leave a request is about, as it was counted when submitted. */
export function useLeave(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.leaves.detail(id),
      fetch: (token, signal) => hrApi.leave(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** The submitter's balances for the leave's own year, so the decision sees what it spends. */
export function useLeaveBalances(userId: string | undefined, year: number | undefined) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.leaves.balances(userId ?? '', year),
      fetch: (token, signal) => hrApi.balances(token, userId ?? '', year, signal),
      staleTime: staleTime.live,
      enabled: Boolean(userId) && year !== undefined,
    }),
  );
}

/** The month of expenses under review, date by date. */
export function useExpenseMonth(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.expenses.month(id),
      fetch: (token, signal) => fieldActivityApi.expenseMonth(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** The daily report under review, with every call, follow-up and expense. */
export function useDcr(id: string, enabled = true) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.dcr.detail(id),
      fetch: (token, signal) => fieldActivityApi.dcr(token, id, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

/** Accepts a flagged call. The report refetches, so the call shows as accepted with who and why. */
export function useAcceptCall(dcrId: string, onDone: () => void) {
  return useApiMutation<{ callId: string; comment: string }>({
    call: (token, { callId, comment }) => fieldActivityApi.overrideGeofence(token, dcrId, callId, { comment: comment.trim() }),
    invalidates: [keys.dcr.detail(dcrId)],
    successMessage: 'The call was accepted.',
    onSuccess: onDone,
  });
}

export function useDailyPlan(id: string, enabled = true) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.plans.daily(id),
      fetch: (token, signal) => planningApi.daily(token, id, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

export function useMonthlyPlan(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.plans.monthly(id),
      fetch: (token, signal) => planningApi.monthly(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function usePlanOwnerRoutes(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: [...keys.plans.monthly(id), 'routes'] as const,
      fetch: (token, signal) => planningApi.monthlyRoutes(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** Admin or a manager replaces the whole month of a waiting plan; the approval stays where it is. */
export function useAmendMonthlyPlan(id: string, onDone: () => void) {
  return useApiMutation<AmendMonthlyPlanDto, MonthlyPlanDetailDto>({
    call: (token, body) => planningApi.amendMonthly(token, id, body),
    invalidates: [keys.plans.monthly(id), keys.approvals.all()],
    successMessage: 'The plan was changed. The employee has been told.',
    onSuccess: onDone,
  });
}

export function useDoctorService(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.doctorServices.detail(id),
      fetch: (token, signal) => fieldActivityApi.doctorService(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** One employee's month of secondary, by product — what a `SECONDARY_SALES` request asks the manager to approve. */
export function useSecondaryMonth(userId: string, month: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.employeeMonth.month(userId, month),
      fetch: (token, signal) => salesApi.employeeSales(token, { userId, month }, signal),
      staleTime: staleTime.live,
      enabled: Boolean(userId && month),
    }),
  );
}
