'use client';

import type { SaveDistributorStatementDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { salesApi } from '@/lib/api/endpoints/sales';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useDistributorStatement(distributorId: string, month: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.distributorStatement.month(distributorId, month),
      fetch: (token, signal) =>
        salesApi.distributorStatement(token, { distributorId, month }, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** Saving refreshes this grid and the Sales and Stock reports, which read the same figures. */
export function useSaveStatement(onDone: () => void) {
  return useApiMutation<SaveDistributorStatementDto, { added: number; changed: number }>({
    call: (token, body) => salesApi.saveStatement(token, body),
    invalidates: [keys.distributorStatement.all(), keys.reports.all()],
    successMessage: 'Statement saved.',
    onSuccess: onDone,
  });
}
