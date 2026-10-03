'use client';

import { useQuery } from '@tanstack/react-query';
import { configApi } from '../api/endpoints/config';
import { authedQueryOptions } from '../query/factory';
import { keys, staleTime } from '../query/keys';
import { setSiteConfig } from '../siteConfig';

/**
 * Reads the financial-year start month and the business timezone once a user is signed in, and hands them to the store the date
 * helpers read. The store is set inside the query function, so it is filled before the query reports success and no screen renders
 * with the old values. A failure is not fatal: the portal keeps the server's own defaults rather than refusing to open.
 */
export function usePublicConfig(enabled: boolean) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.config.public(),
      fetch: async (token, signal) => {
        const config = await configApi.publicSettings(token, signal);
        setSiteConfig(config);
        return config;
      },
      staleTime: staleTime.configuration,
      enabled,
      retry: false,
    }),
  );
}
