'use client';

import type {
  CreateDesignationDto,
  CreatePayBandDto,
  UpdatePayBandDto,
} from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { designationsApi, payBandsApi } from '@/lib/api/endpoints/identity';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

export function useDesignations() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.designations.all(),
      fetch: (token, signal) => designationsApi.list(token, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function usePayBands() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.payBands.all(),
      fetch: (token, signal) => payBandsApi.list(token, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

export function useCreateDesignation(onDone: () => void) {
  return useApiMutation<CreateDesignationDto>({
    call: (token, body) => designationsApi.create(token, body),
    invalidates: [keys.designations.all()],
    successMessage: 'Designation created.',
    onSuccess: onDone,
  });
}
export function useCreatePayBand(onDone: () => void) {
  return useApiMutation<CreatePayBandDto>({
    call: (token, body) => payBandsApi.create(token, body),
    invalidates: [keys.payBands.all()],
    successMessage: 'Pay band created.',
    onSuccess: onDone,
  });
}
export function useUpdatePayBand(onDone: () => void) {
  return useApiMutation<{ id: string; body: UpdatePayBandDto }>({
    call: (token, { id, body }) => payBandsApi.update(token, id, body),
    invalidates: [keys.payBands.all()],
    successMessage: 'Pay band updated.',
    onSuccess: onDone,
  });
}
