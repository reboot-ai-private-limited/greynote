'use client';

import type { UpdateVisualDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { marketingApi } from '@/lib/api/endpoints/marketing';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useVisuals(query: { status?: 'active' | 'inactive'; productId?: string } = {}) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.visuals.list(query),
      fetch: (token, signal) => marketingApi.listVisuals(token, query, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function useUploadVisual(onDone: () => void) {
  return useApiMutation<FormData>({
    call: (token, body) => marketingApi.uploadVisual(token, body),
    invalidates: [keys.visuals.all()],
    successMessage: 'Visual uploaded.',
    onSuccess: onDone,
  });
}

export function useUpdateVisual(onDone?: () => void) {
  return useApiMutation<{ id: string; body: UpdateVisualDto }>({
    call: (token, { id, body }) => marketingApi.updateVisual(token, id, body),
    invalidates: [keys.visuals.all()],
    successMessage: 'Visual updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}

/** What was picked for one doctor, with whether the viewer may take picks off. */
export function useDoctorVisuals(doctorId: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.visuals.forDoctor(doctorId),
      fetch: (token, signal) => marketingApi.doctorVisuals(token, doctorId, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useRemoveDoctorVisual(doctorId: string, onDone?: () => void) {
  return useApiMutation<string>({
    call: (token, visualId) => marketingApi.removeDoctorVisual(token, doctorId, visualId),
    invalidates: [keys.visuals.forDoctor(doctorId)],
    successMessage: 'Taken off the doctor’s list.',
    ...(onDone && { onSuccess: onDone }),
  });
}
