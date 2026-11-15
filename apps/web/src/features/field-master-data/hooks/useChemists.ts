'use client';

import type { ChemistDto, CreateChemistDto, UpdateChemistDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { chemistsApi, type ListChemistsQuery } from '@/lib/api/endpoints/fieldMasterData';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useChemists(query?: ListChemistsQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.chemists.list(query),
      fetch: (token, signal) => chemistsApi.list(token, query, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function useChemist(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.chemists.detail(id),
      fetch: (token, signal) => chemistsApi.get(token, id, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function useCreateChemist(onDone: (chemist: ChemistDto) => void) {
  return useApiMutation<CreateChemistDto, ChemistDto>({
    call: (token, body) => chemistsApi.create(token, body),
    invalidates: [keys.chemists.all()],
    successMessage: 'Chemist created.',
    onSuccess: onDone,
  });
}

export function useUpdateChemist(onDone?: (chemist: ChemistDto) => void) {
  return useApiMutation<{ id: string; body: UpdateChemistDto }, ChemistDto>({
    call: (token, { id, body }) => chemistsApi.update(token, id, body),
    invalidates: [keys.chemists.all()],
    successMessage: 'Chemist updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}

export function useChemistAssignments(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.chemists.assignments(id),
      fetch: (token, signal) => chemistsApi.assignments(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

/**
 * Sets who holds a chemist to exactly `userIds`: the new ones are added and the ones left out are taken off, one request each. Many MRs can
 * hold one chemist, so this never replaces anyone who stays ticked. The list rows and detail refetch.
 */
export function useSetChemistHolders(chemistId: string, onDone: () => void) {
  return useApiMutation<{ add: string[]; remove: string[] }>({
    call: async (token, { add, remove }) => {
      for (const userId of add) await chemistsApi.assign(token, chemistId, userId);
      for (const userId of remove) await chemistsApi.unassign(token, chemistId, userId);
    },
    invalidates: [keys.chemists.all()],
    successMessage: 'Assigned MRs updated.',
    onSuccess: onDone,
  });
}

export function useUnassignChemist(chemistId: string, onDone: () => void) {
  return useApiMutation<string>({
    call: (token, userId) => chemistsApi.unassign(token, chemistId, userId),
    invalidates: [keys.chemists.all()],
    successMessage: 'MR removed from this chemist.',
    onSuccess: onDone,
  });
}
