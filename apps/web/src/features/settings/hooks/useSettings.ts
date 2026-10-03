'use client';

import type { ConfigSettingDto } from '@greynote/contracts';
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
