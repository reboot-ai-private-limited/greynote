'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getFinancialYear, setFinancialYear, subscribeFinancialYear } from './financial-year';

/** A past Financial Year is read-only server-side (409); screens disable their write controls to match. */
export function useIsReadOnly(): boolean {
  return useSyncExternalStore(subscribeFinancialYear, getFinancialYear, () => null) !== null;
}

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
