'use client';

import type { AllocateGiftDto, CreateAdminServiceDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { fieldActivityApi } from '@/lib/api/endpoints/fieldActivity';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** Admin: every Doctor Service, newest first (a bare array, capped at 200). */
export function useDoctorServices(query: { doctorId?: string | undefined }) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.doctorServices.list(query),
      fetch: (token, signal) => fieldActivityApi.doctorServices(token, query, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useCreateDoctorService(onDone: () => void) {
  return useApiMutation<CreateAdminServiceDto>({
    call: (token, body) => fieldActivityApi.createDoctorService(token, body),
    invalidates: [keys.doctorServices.all()],
    successMessage: 'Service recorded.',
    onSuccess: onDone,
  });
}

export function useMarkServiceDone() {
  return useApiMutation<string, unknown>({
    call: (token, id) => fieldActivityApi.markDoctorServiceDone(token, id),
    invalidates: [keys.doctorServices.all()],
    successMessage: 'Marked done.',
  });
}

/** Admin: every gift, newest first (a bare array, capped at 200), optionally only pending or done. */
export function useDoctorGifts(query: { status?: 'PENDING' | 'DONE' | undefined }) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.doctorGifts.list(query),
      fetch: (token, signal) => fieldActivityApi.doctorGifts(token, query, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useAllocateGift(onDone: () => void) {
  return useApiMutation<AllocateGiftDto>({
    call: (token, body) => fieldActivityApi.allocateGift(token, body),
    invalidates: [keys.doctorGifts.all()],
    successMessage: 'Gift allocated.',
    onSuccess: onDone,
  });
}
