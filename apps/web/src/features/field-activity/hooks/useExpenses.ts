'use client';

import type {
  ExpenseMonthGrantDto,
  FinalizeExpensesDto,
  FinalizeOutcomeDto,
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
import type { DayOp } from '../lib/expenseAdjust';

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

/** The month table: every active field employee's expenses for the month. */
export function useExpenseOverview(month: string, enabled: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.expenses.overview(month),
      fetch: (token, signal) => fieldActivityApi.expenseOverview(token, month, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

/** One employee's month, day by day. */
export function useExpenseReview(userId: string, month: string, enabled: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.expenses.review(userId, month),
      fetch: (token, signal) => fieldActivityApi.expenseReview(token, userId, month, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
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

export interface AdjustDayInput {
  userId: string;
  date: string;
  reason: string;
  ops: DayOp[];
}

/**
 * HR's changes to one day, sent one after another (an edit per changed row, an add per new TA or DA). It stops at the first refusal, so a
 * paid or already-changed row says so; whatever went through stays, and the review refetches either way.
 */
export function useAdjustDay(onDone: () => void) {
  return useApiMutation<AdjustDayInput, number>({
    call: async (token, input) => {
      let done = 0;
      for (const op of input.ops) {
        if (op.kind === 'edit') await fieldActivityApi.adjustExpenseRow(token, op.id, { amountPaise: op.amountPaise, reason: input.reason });
        else await fieldActivityApi.addExpenseRow(token, { userId: input.userId, date: input.date, type: op.type, amountPaise: op.amountPaise, reason: input.reason });
        done += 1;
      }
      return done;
    },
    invalidates: [keys.expenses.all()],
    successMessage: 'The day was changed.',
    onSuccess: onDone,
  });
}

/** Finalizes months; the sheets refetch whatever the outcome. */
export function useFinalizeExpenses(onResult: (outcomes: FinalizeOutcomeDto[]) => void) {
  return useApiMutation<FinalizeExpensesDto, FinalizeOutcomeDto[]>({
    call: (token, body) => fieldActivityApi.finalizeExpenses(token, body),
    invalidates: [keys.expenses.all()],
    onSuccess: onResult,
  });
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
