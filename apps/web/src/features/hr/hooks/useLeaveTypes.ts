'use client';

import type { CreateLeaveTypeDto, UpdateLeaveTypeDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { hrApi } from '@/lib/api/endpoints/hr';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** A handful of rows returned as a bare array, never paginated. Anyone may read it; HR and Admin change it. */
export function useLeaveTypes() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.hr.leaveTypes(),
      fetch: (token, signal) => hrApi.leaveTypes(token, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

/** A change to a type also changes the Leave Master's columns, so both refetch. */
const invalidates = () => [keys.hr.leaveTypes(), keys.hr.policies()];

export function useCreateLeaveType(onDone: () => void) {
  return useApiMutation<CreateLeaveTypeDto>({
    call: (token, body) => hrApi.createLeaveType(token, body),
    invalidates: invalidates(),
    successMessage: 'Leave type created.',
    onSuccess: onDone,
  });
}

export function useUpdateLeaveType(onDone?: () => void) {
  return useApiMutation<{ id: string; body: UpdateLeaveTypeDto }>({
    call: (token, { id, body }) => hrApi.updateLeaveType(token, id, body),
    invalidates: invalidates(),
    successMessage: 'Leave type updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}
