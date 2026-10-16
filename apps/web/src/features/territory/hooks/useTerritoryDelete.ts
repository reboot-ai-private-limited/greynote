'use client';

import type { TerritoryDeleteResultDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { territoryDeleteApi, type TerritorySegment } from '@/lib/api/endpoints/territory';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** What deleting would take and touch. Never cached: it is read at the moment the dialog opens. */
export function useDeleteImpact(segment: TerritorySegment, id: string | null) {
  return useQuery(
    authedQueryOptions({
      queryKey: ['territory-delete-impact', segment, id] as const,
      fetch: (token, signal) => territoryDeleteApi.impact(token, segment, id as string, signal),
      staleTime: 0,
      enabled: id !== null,
    }),
  );
}

/** A delete reaches employees (routes, HQs, coverage), doctors and the lists that name territory, so all of it refetches. */
export function useDeleteTerritory(
  segment: TerritorySegment,
  onDone: (result: TerritoryDeleteResultDto) => void,
) {
  return useApiMutation<string, TerritoryDeleteResultDto>({
    call: (token, id) => territoryDeleteApi.remove(token, segment, id),
    invalidates: [
      keys.zones.all(),
      keys.hqs.all(),
      keys.routes.all(),
      keys.users.all(),
      ['managerCandidates'],
      ['territory-delete-impact'],
    ],
    successMessage: 'Deleted.',
    onSuccess: onDone,
  });
}
