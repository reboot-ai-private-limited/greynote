'use client';

import type { ConfigSettingDto, FinancialYearCloseDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { configApi } from '@/lib/api/endpoints/config';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import { needsReload } from '@/lib/siteConfig';

/** Every setting with its rules and value. Admin only: the API refuses everyone else. */
export function useSettings() {
  return useQuery(
    authedQueryOptions<ConfigSettingDto[]>({
      queryKey: keys.config.list(),
      fetch: (token, signal) => configApi.list(token, signal),
      // Only Admins change these, and rarely; a refetch on focus is enough.
      staleTime: staleTime.configuration,
    }),
  );
}

/**
 * Saves one setting. Everything under `config` refetches, and so does the public settings query, since the financial-year start month
 * and the timezone are among them.
 */
export function useUpdateSetting(key: string, label: string, onDone: () => void) {
  return useApiMutation<string>({
    call: (token, value) => configApi.update(token, key, { value }),
    invalidates: [keys.config.all(), keys.config.public()],
    successMessage: `${label} saved.`,
    onSuccess: () => {
      onDone();
      // The financial-year start month and the timezone shape every date already on screen, so the portal reloads to read them afresh.
      if (needsReload(key) && typeof window !== 'undefined') window.setTimeout(() => window.location.reload(), 800);
    },
  });
}

/** The closed financial years and the ended ones that can still be closed. Admin only. */
export function useFinancialYearClose() {
  return useQuery(
    authedQueryOptions<FinancialYearCloseDto>({
      queryKey: keys.config.financialYear(),
      fetch: (token, signal) => configApi.financialYear(token, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

/** Closes (or reopens) one year. The state refetches either way; the server refuses a year that has not ended, or is not closed. */
export function useCloseYear(action: 'close' | 'reopen', onDone: () => void) {
  return useApiMutation<number, FinancialYearCloseDto>({
    call: (token, year) => (action === 'close' ? configApi.closeYear(token, year) : configApi.reopenYear(token, year)),
    invalidates: [keys.config.all()],
    successMessage: action === 'close' ? 'The financial year was closed.' : 'The financial year was reopened.',
    onSuccess: onDone,
  });
}
