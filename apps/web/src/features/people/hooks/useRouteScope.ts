'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useMemo } from 'react';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useManagerCoverage } from '@/features/territory/hooks/useManagerCoverage';
import { routeScope, type RouteScope } from '../lib/routeScope';

/** The routes that suit this employee: those under what they cover. Unlimited until the data has loaded, so nothing is flagged by mistake. */
export function useRouteScope(user: UserDetailDto): RouteScope {
  const hqs = useAllHqs();
  const coverage = useManagerCoverage(user.id);
  return useMemo(
    () =>
      routeScope({
        coverage: hqs.isLoading || coverage.isLoading ? undefined : coverage.data,
        zoneOfHq: new Map((hqs.data ?? []).map((h) => [h.id, h.zoneId])),
      }),
    [hqs.data, hqs.isLoading, coverage.data, coverage.isLoading],
  );
}
