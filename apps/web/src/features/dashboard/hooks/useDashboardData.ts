'use client';

import { useQuery } from '@tanstack/react-query';
import { approvalsApi } from '@/lib/api/endpoints/approvals';
import { fieldActivityApi } from '@/lib/api/endpoints/fieldActivity';
import { hrApi } from '@/lib/api/endpoints/hr';
import { identityApi } from '@/lib/api/endpoints/identity';
import { payrollApi } from '@/lib/api/endpoints/payroll';
import { salesApi } from '@/lib/api/endpoints/sales';
import { addDays, istDate, istMonth, previousMonth } from '@/lib/dates';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import type { TileQuery } from '../lib/tileQuery';

/**
 * One hook per data source. Each dashboard tile owns its query, so one failing endpoint fails one
 * tile — never the page. The numbers are the live work-queue, so there is no stale window.
 */
const live = { staleTime: staleTime.live, refetchOnWindowFocus: true } as const;

/** The oldest-waiting requests; the tile and the list share this one query. */
export function useApprovalInbox(kind?: string) {
  const query = { kind, page: 1, pageSize: 5 };
  return useQuery(
    authedQueryOptions({
      queryKey: keys.approvals.inbox(query),
      fetch: (token, signal) => approvalsApi.inbox(token, query, signal),
      ...live,
    }),
  );
}

export function usePendingDevices() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.devices.pending(),
      fetch: (token, signal) => identityApi.pendingDevices(token, signal),
      ...live,
    }),
  );
}

function useUserCount(status: 'active' | 'pending') {
  const query = { status, page: 1, pageSize: 1 };
  return useQuery(
    authedQueryOptions({
      queryKey: keys.users.list(query),
      fetch: async (token, signal) => (await identityApi.users(token, query, signal)).total,
      ...live,
    }),
  );
}

/** Active and onboarding counts, presented as the single query-shaped value a tile expects. */
export function useEmployeeCounts(): TileQuery<{ active: number; pending: number }> {
  const active = useUserCount('active');
  const pending = useUserCount('pending');
  return {
    data:
      active.data !== undefined && pending.data !== undefined
        ? { active: active.data, pending: pending.data }
        : undefined,
    error: active.error ?? pending.error,
    isLoading: active.isLoading || pending.isLoading,
    refetch: () => Promise.all([active.refetch(), pending.refetch()]),
  };
}

export function useMissingStock() {
  const month = istMonth();
  return useQuery(
    authedQueryOptions({
      queryKey: keys.monthlyStock.missing(month),
      fetch: (token, signal) => salesApi.missingStock(token, { month }, signal),
      ...live,
    }),
  );
}

export function useOnLeaveToday() {
  const today = istDate();
  const query = { from: today, to: today, pageSize: 100 };
  return useQuery(
    authedQueryOptions({
      queryKey: keys.leaves.range(query),
      fetch: (token, signal) => hrApi.leaves(token, query, signal),
      ...live,
    }),
  );
}

/** Unpaid claims over the last year (the endpoint allows 400 days), capped server-side at 500. */
export function useUnpaidExpenses() {
  const to = istDate();
  const query = { from: addDays(to, -365), to, paymentStatus: 'UNPAID' as const };
  return useQuery(
    authedQueryOptions({
      queryKey: keys.expenses.audit(query),
      fetch: (token, signal) => fieldActivityApi.expenses(token, query, signal),
      ...live,
    }),
  );
}

export const PAYROLL_MONTH = () => previousMonth(istMonth());

/** The month that has just ended — the one whose payroll is being run. */
export function usePayrollStatus() {
  const month = PAYROLL_MONTH();
  return useQuery(
    authedQueryOptions({
      queryKey: keys.payroll.month({ month }),
      fetch: (token, signal) => payrollApi.list(token, { month }, signal),
      ...live,
    }),
  );
}

