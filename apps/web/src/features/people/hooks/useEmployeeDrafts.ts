'use client';

import type { EmployeeDraftDto, FinalizedEmployeeDto, SaveEmployeeDraftDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { employeeDraftsApi } from '@/lib/api/endpoints/identity';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useEmployeeDrafts() {
  return useQuery(
    authedQueryOptions({
      queryKey: [...keys.employeeDrafts.all(), 'list'],
      fetch: (token, signal) => employeeDraftsApi.list(token, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useEmployeeDraft(id: string | null) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.employeeDrafts.detail(id ?? ''),
      fetch: (token, signal) => employeeDraftsApi.get(token, id ?? '', signal),
      // The wizard owns the form once it has loaded; a refetch must not overwrite what is being typed.
      staleTime: Infinity,
      enabled: Boolean(id),
    }),
  );
}

/** Creates the draft the first time, then updates it. No toast: the wizard says "Draft saved" only when asked to. */
export function useSaveEmployeeDraft() {
  return useApiMutation<{ id: string | null; body: SaveEmployeeDraftDto }, EmployeeDraftDto>({
    call: (token, { id, body }) => (id ? employeeDraftsApi.update(token, id, body) : employeeDraftsApi.create(token, body)),
    invalidates: [[...keys.employeeDrafts.all(), 'list']],
  });
}

export function useDeleteEmployeeDraft() {
  return useApiMutation<string>({
    call: (token, id) => employeeDraftsApi.remove(token, id).then(() => undefined),
    invalidates: [keys.employeeDrafts.all()],
    successMessage: 'Draft deleted.',
  });
}

export function useFinalizeEmployeeDraft(onDone: (result: FinalizedEmployeeDto) => void) {
  return useApiMutation<string, FinalizedEmployeeDto>({
    call: (token, id) => employeeDraftsApi.finalize(token, id),
    invalidates: [keys.employeeDrafts.all(), keys.users.all()],
    onSuccess: onDone,
  });
}
