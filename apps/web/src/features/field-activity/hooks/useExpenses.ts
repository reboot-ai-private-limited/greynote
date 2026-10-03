'use client';

import type { ExpensePaymentStatus } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { fieldActivityApi } from '@/lib/api/endpoints/fieldActivity';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

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
