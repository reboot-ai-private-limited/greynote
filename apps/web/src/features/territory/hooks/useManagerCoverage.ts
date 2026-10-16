'use client';

import type { SetManagerCoverageDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { managerApi } from '@/lib/api/endpoints/territory';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** The HQs and Zones a manager covers. Admin and HR. */
export function useManagerCoverage(userId: string, enabled = true) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.managerCoverage(userId),
      fetch: (token, signal) => managerApi.coverage(token, userId, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

export function useSetManagerCoverage(userId: string, onDone: () => void) {
  return useApiMutation<SetManagerCoverageDto>({
    call: (token, body) => managerApi.setCoverage(token, userId, body),
    // The main HQ may change with it, and holidays follow the territory, so the profile, HQ history and leave data refetch too.
    invalidates: [keys.managerCoverage(userId), ['managerCandidates'], keys.users.all(), keys.userHq.history(userId), keys.leaves.root(), keys.routes.all()],
    successMessage: 'Territory saved.',
    onSuccess: onDone,
  });
}

/** Managers above `level` who cover `hqId` (all of them without an HQ), nearest level first. */
export function useManagerCandidatesAbove(query: { level: number; hqId?: string | undefined; search?: string | undefined; excludeUserId?: string | undefined }, enabled: boolean) {
  const clean = { level: query.level, ...(query.hqId && { hqId: query.hqId }), ...(query.search && { search: query.search }), ...(query.excludeUserId && { excludeUserId: query.excludeUserId }) };
  return useQuery(
    authedQueryOptions({
      queryKey: keys.managerCandidates(clean),
      fetch: (token, signal) => managerApi.candidates(token, clean, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}
