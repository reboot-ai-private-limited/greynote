'use client';

import type { CreateDistributorDto, DistributorDto, UpdateDistributorDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { distributorsApi, type ListDistributorsQuery } from '@/lib/api/endpoints/fieldMasterData';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useDistributors(query?: ListDistributorsQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.distributors.list(query),
      fetch: (token, signal) => distributorsApi.list(token, query, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function useDistributor(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.distributors.detail(id),
      fetch: (token, signal) => distributorsApi.get(token, id, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function useCreateDistributor(onDone: (distributor: DistributorDto) => void) {
  return useApiMutation<CreateDistributorDto, DistributorDto>({
    call: (token, body) => distributorsApi.create(token, body),
    invalidates: [keys.distributors.all()],
    successMessage: 'Distributor created.',
    onSuccess: onDone,
  });
}

export function useUpdateDistributor(onDone?: (distributor: DistributorDto) => void) {
  return useApiMutation<{ id: string; body: UpdateDistributorDto }, DistributorDto>({
    call: (token, { id, body }) => distributorsApi.update(token, id, body),
    invalidates: [keys.distributors.all()],
    successMessage: 'Distributor updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}
