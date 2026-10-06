'use client';

import type { CreateSpecialtyDto, UpdateSpecialtyDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { specialtiesApi, type ListSpecialtiesQuery } from '@/lib/api/endpoints/fieldMasterData';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useSpecialties(query?: ListSpecialtiesQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.specialties.list(query),
      fetch: (token, signal) => specialtiesApi.list(token, query, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

/** The active specialities' names, A–Z, for a dropdown. One page of 100 (the API's cap): a list of specialities is tens, not thousands. */
export function useActiveSpecialtyNames() {
  const query = useQuery(
    authedQueryOptions({
      queryKey: keys.specialties.active(),
      fetch: (token, signal) => specialtiesApi.list(token, { page: 1, pageSize: 100, status: 'active' }, signal),
      staleTime: staleTime.configuration,
    }),
  );
  return { names: (query.data?.items ?? []).map((s) => s.name), isLoading: query.isLoading };
}

export function useCreateSpecialty(onDone: () => void) {
  return useApiMutation<CreateSpecialtyDto>({
    call: (token, body) => specialtiesApi.create(token, body),
    invalidates: [keys.specialties.all()],
    successMessage: 'Speciality added.',
    onSuccess: onDone,
  });
}

/** A rename also renames it on the doctors that carry it, so the doctors lists refresh too. */
export function useUpdateSpecialty(onDone?: () => void) {
  return useApiMutation<{ id: string; body: UpdateSpecialtyDto }>({
    call: (token, { id, body }) => specialtiesApi.update(token, id, body),
    invalidates: [keys.specialties.all(), keys.doctors.all()],
    successMessage: 'Speciality updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}
