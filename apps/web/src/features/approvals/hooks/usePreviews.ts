'use client';

import { useQuery } from '@tanstack/react-query';
import { fieldActivityApi } from '@/lib/api/endpoints/fieldActivity';
import { hrApi } from '@/lib/api/endpoints/hr';
import { planningApi } from '@/lib/api/endpoints/planning';
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

export function usePlanChange(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.plans.change(id),
      fetch: (token, signal) => planningApi.change(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}
