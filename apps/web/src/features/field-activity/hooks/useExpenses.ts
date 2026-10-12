'use client';

import type {
  ExpenseMonthGrantDto,
  ExpensePaymentStatus,
  GrantExpenseMonthDto,
  PayExpensesDto,
  PayOutcomeDto,
} from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { fieldActivityApi, type ListExpenseGrantsQuery } from '@/lib/api/endpoints/fieldActivity';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import { markRowsPaid, type MarkPaidResult } from '../lib/expenses';

export interface ExpenseAuditQuery {
  from: string;
  to: string;
  userId?: string | undefined;
  paymentStatus?: ExpensePaymentStatus | undefined;
}

/** The audit list for a range: at most 500 rows. `enabled` is off while the range is invalid, so no request is sent. */
export function useExpenseAudit(query: ExpenseAuditQuery, enabled: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.expenses.audit(query),
      fetch: (token, signal) => fieldActivityApi.expenses(token, query, signal),
      // Paid and sent-back rows change under the Accountant's feet, so this is not held fresh.
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

/**
 * Marks each row paid, one request each. It never throws on a refused row: the caller gets which were paid and which were not,
 * with the server's message, and the list refetches either way.
 */
export function useMarkPaid(onResult: (result: MarkPaidResult) => void) {
  return useApiMutation<string[], MarkPaidResult>({
    call: (token, ids) => markRowsPaid((id) => fieldActivityApi.markPaid(token, id), ids),
    invalidates: [keys.expenses.all()],
    onSuccess: onResult,
  });
}

/** One month's expense payout sheet. `enabled` is off while no month is chosen. */
export function useExpensePayouts(month: string, enabled: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.expenses.payouts(month),
      fetch: (token, signal) => fieldActivityApi.expensePayouts(token, month, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

/** Pays a month's unpaid expenses for some employees or everyone owed; the sheet refetches either way. */
export function usePayExpenses(onResult: (outcomes: PayOutcomeDto[]) => void) {
  return useApiMutation<PayExpensesDto, PayOutcomeDto[]>({
    call: (token, body) => fieldActivityApi.payExpenses(token, body),
    invalidates: [keys.expenses.all()],
    onSuccess: onResult,
  });
}

/** Late-expense exceptions, newest first. They get used up, so they are not held fresh. */
export function useExpenseGrants(query: ListExpenseGrantsQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.expenses.grants(query),
      fetch: (token, signal) => fieldActivityApi.expenseGrants(token, query, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useGrantExpenseMonth(onDone: () => void) {
  return useApiMutation<GrantExpenseMonthDto, ExpenseMonthGrantDto>({
    call: (token, body) => fieldActivityApi.grantExpenseMonth(token, body),
    invalidates: [keys.expenses.all()],
    successMessage: 'Late expenses allowed.',
    onSuccess: onDone,
  });
}

export function useRevokeExpenseGrant(onDone: () => void) {
  return useApiMutation<string, ExpenseMonthGrantDto>({
    call: (token, id) => fieldActivityApi.revokeExpenseGrant(token, id),
    invalidates: [keys.expenses.all()],
    successMessage: 'Exception revoked.',
    onSuccess: onDone,
  });
}
