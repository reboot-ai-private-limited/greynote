'use client';

import type { ExtendManagerTerritoryDto, SetManagerCoverageDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { assignmentsApi, managerApi } from '@/lib/api/endpoints/territory';
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

/** Coverage and routes in one save: the HQs/Zones first, then the routes to add and to take off. Routes are only what is stored, so both move together. */
export function useSetTerritory(userId: string, onDone: () => void) {
  return useApiMutation<{ coverage: SetManagerCoverageDto; add: string[]; remove: string[] }>({
    call: async (token, { coverage, add, remove }) => {
      await managerApi.setCoverage(token, userId, coverage);
      for (const routeId of remove) await assignmentsApi.unassign(token, routeId, userId);
      for (const routeId of add) await assignmentsApi.assign(token, routeId, userId);
    },
    invalidates: [
      keys.managerCoverage(userId),
      ['managerCandidates'],
      keys.users.all(),
      keys.userHq.history(userId),
      keys.leaves.root(),
      keys.routes.all(),
    ],
    successMessage: 'Territory saved.',
    onSuccess: onDone,
  });
}

/** Adds the Zones, HQs and routes ticked in the manager picker to a manager's territory (union only). */
export function useExtendManagerTerritory() {
  return useApiMutation<{ managerId: string; body: ExtendManagerTerritoryDto }>({
    call: (token, { managerId, body }) => managerApi.extendTerritory(token, managerId, body),
    invalidates: [['managerCandidates'], keys.routes.all(), ['managerCoverage'], keys.teamGaps.all()],
  });
}

/** What this manager's direct reports cover or hold that the manager does not (null: nobody or nothing). Admin and HR. */
export function useTeamGap(userId: string, enabled = true) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.teamGaps.one(userId),
      fetch: (token, signal) => managerApi.teamGap(token, userId, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

/** Every manager with a gap, for the review screen. */
export function useTeamGaps() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.teamGaps.list(),
      fetch: (token, signal) => managerApi.teamGaps(token, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** Managers above `level` who cover `hqId` (all of them without an HQ), nearest level first. */
export function useManagerCandidatesAbove(
  query: {
    level: number;
    hqId?: string | undefined;
    search?: string | undefined;
    excludeUserId?: string | undefined;
  },
  enabled: boolean,
) {
  const clean = {
    level: query.level,
    ...(query.hqId && { hqId: query.hqId }),
    ...(query.search && { search: query.search }),
    ...(query.excludeUserId && { excludeUserId: query.excludeUserId }),
  };
  return useQuery(
    authedQueryOptions({
      queryKey: keys.managerCandidates(clean),
      fetch: (token, signal) => managerApi.candidates(token, clean, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}
