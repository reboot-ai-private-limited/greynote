'use client';

import type { AdjustLeaveBalanceDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { hrApi } from '@/lib/api/endpoints/hr';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/**
 * An employee's balances for the leave year in view. The year follows the financial-year switcher (the API refuses a year
 * outside it), so it is omitted for the current year rather than chosen here.
 */
export function useEmployeeBalances(userId: string, year: number | null) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.leaves.balances(userId, year ?? undefined),
      fetch: (token, signal) => hrApi.balances(token, userId, year ?? undefined, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** A one-off top-up or cut for one employee and one paid type. It does not touch the Leave Master. */
export function useAdjustBalance(userId: string, leaveTypeId: string, onDone: () => void) {
  return useApiMutation<AdjustLeaveBalanceDto>({
    call: (token, body) => hrApi.adjustBalance(token, userId, leaveTypeId, body),
    invalidates: [keys.leaves.root()],
    successMessage: 'Allocation changed.',
    onSuccess: onDone,
  });
}
