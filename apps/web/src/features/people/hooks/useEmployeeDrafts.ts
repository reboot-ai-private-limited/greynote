'use client';

import type { EmployeeDraftDto, FinalizedEmployeeDto, SaveEmployeeDraftDto } from '@greynote/contracts';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { employeeDraftsApi } from '@/lib/api/endpoints/identity';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/**
 * The wizard reads a draft once and then owns the form, so the detail query never refetches (`staleTime: Infinity`).
 * That makes this cache the source for "Continue": every save must write its result here, and a draft that is
 * gone must leave, or Continue reopens an older copy of it.
 */
export function rememberDraft(queryClient: QueryClient, draft: EmployeeDraftDto): void {
  queryClient.setQueryData(keys.employeeDrafts.detail(draft.id), draft);
}

export function forgetDraft(queryClient: QueryClient, id: string): void {
  queryClient.removeQueries({ queryKey: keys.employeeDrafts.detail(id) });
}

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
  const queryClient = useQueryClient();
  return useApiMutation<{ id: string | null; body: SaveEmployeeDraftDto }, EmployeeDraftDto>({
    call: (token, { id, body }) => (id ? employeeDraftsApi.update(token, id, body) : employeeDraftsApi.create(token, body)),
    invalidates: [[...keys.employeeDrafts.all(), 'list']],
    onSuccess: (draft) => rememberDraft(queryClient, draft),
  });
}

export function useDeleteEmployeeDraft() {
  const queryClient = useQueryClient();
  return useApiMutation<string>({
    call: (token, id) => employeeDraftsApi.remove(token, id).then(() => undefined),
    invalidates: [[...keys.employeeDrafts.all(), 'list']],
    successMessage: 'Draft deleted.',
    onSuccess: (_result, id) => forgetDraft(queryClient, id),
  });
}

export function useFinalizeEmployeeDraft(onDone: (result: FinalizedEmployeeDto) => void) {
  const queryClient = useQueryClient();
  return useApiMutation<string, FinalizedEmployeeDto>({
    call: (token, id) => employeeDraftsApi.finalize(token, id),
    invalidates: [[...keys.employeeDrafts.all(), 'list'], keys.users.all()],
    onSuccess: (result, id) => {
      forgetDraft(queryClient, id);
      onDone(result);
    },
  });
}
