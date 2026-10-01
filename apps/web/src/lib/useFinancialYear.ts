'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getFinancialYear, setFinancialYear, subscribeFinancialYear } from './financial-year';

/** The selected Financial Year. Changing it drops the cache — a past year is different data. */
export function useFinancialYear() {
  const queryClient = useQueryClient();
  const year = useSyncExternalStore(subscribeFinancialYear, getFinancialYear, () => null);
  const select = useCallback(
    (next: number | null) => {
      setFinancialYear(next);
      queryClient.clear();
    },
    [queryClient],
  );
  return { year, select };
}
