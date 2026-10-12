'use client';

import type { CreateDoctorDto, DoctorDto, IssueSampleDto, SampleAllocationDto, UpdateDoctorDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { doctorsApi, type ListDoctorsQuery } from '@/lib/api/endpoints/fieldMasterData';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

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

/** A manager or Admin correcting a doctor that is waiting for approval. */
export function useReviewDoctor(onDone?: (doctor: DoctorDto) => void) {
  return useApiMutation<{ id: string; body: UpdateDoctorDto }, DoctorDto>({
    call: (token, { id, body }) => doctorsApi.review(token, id, body),
    invalidates: [keys.doctors.all()],
    successMessage: 'Doctor updated. Approve it when it looks right.',
    ...(onDone && { onSuccess: onDone }),
  });
}

export function useDoctorAssignments(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.doctors.assignments(id),
      fetch: (token, signal) => doctorsApi.assignments(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** Assigning replaces whoever was responsible; the doctor's list row and detail show it, so they refetch too. */
export function useAssignDoctor(doctorId: string, onDone: () => void) {
  return useApiMutation<string>({
    call: (token, userId) => doctorsApi.assign(token, doctorId, userId),
    invalidates: [keys.doctors.all()],
    successMessage: 'Responsible MR changed.',
    onSuccess: onDone,
  });
}

export function useUnassignDoctor(doctorId: string, onDone: () => void) {
  return useApiMutation<string>({
    call: (token, userId) => doctorsApi.unassign(token, doctorId, userId),
    invalidates: [keys.doctors.all()],
    successMessage: 'MR removed from this doctor.',
    onSuccess: onDone,
  });
}

export function useDoctorSamples(id: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.doctors.samples(id),
      fetch: (token, signal) => doctorsApi.samples(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useIssueSample(doctorId: string, onDone: () => void) {
  return useApiMutation<IssueSampleDto, SampleAllocationDto>({
    call: (token, body) => doctorsApi.issueSample(token, doctorId, body),
    invalidates: [keys.doctors.samples(doctorId)],
    successMessage: 'Samples issued.',
    onSuccess: onDone,
  });
}

export function useAdjustSample(doctorId: string, onDone: () => void) {
  return useApiMutation<{ productId: string; quantityAllocated: number }, SampleAllocationDto>({
    call: (token, { productId, quantityAllocated }) => doctorsApi.adjustSample(token, doctorId, productId, { quantityAllocated }),
    invalidates: [keys.doctors.samples(doctorId)],
    successMessage: 'Allocation corrected.',
    onSuccess: onDone,
  });
}
