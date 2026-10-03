'use client';

import type { CreateDoctorDto, DoctorDto, UpdateDoctorDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { doctorsApi, type ListDoctorsQuery } from '@/lib/api/endpoints/fieldMasterData';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import { distinctCategories } from '../lib/doctors';

/** Doctors change under Admin's feet (an MR adds one, an approval lands), so the list is not cached long. */
export function useDoctors(query?: ListDoctorsQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.doctors.list(query),
      fetch: (token, signal) => doctorsApi.list(token, query, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useDoctor(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.doctors.detail(id),
      fetch: (token, signal) => doctorsApi.get(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** The categories in use, from one page of 100 (the API's cap): a hint for the filter and the form, not a master list. */
export function useDoctorCategories() {
  const doctors = useDoctors({ page: 1, pageSize: 100 });
  return { categories: distinctCategories(doctors.data?.items ?? []), isLoading: doctors.isLoading };
}

export function useCreateDoctor(onDone: (doctor: DoctorDto) => void) {
  return useApiMutation<CreateDoctorDto, DoctorDto>({
    call: (token, body) => doctorsApi.create(token, body),
    invalidates: [keys.doctors.all()],
    successMessage: 'Doctor created.',
    onSuccess: onDone,
  });
}

export function useUpdateDoctor(onDone?: (doctor: DoctorDto) => void) {
  return useApiMutation<{ id: string; body: UpdateDoctorDto }, DoctorDto>({
    call: (token, { id, body }) => doctorsApi.update(token, id, body),
    invalidates: [keys.doctors.all()],
    successMessage: 'Doctor updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}
