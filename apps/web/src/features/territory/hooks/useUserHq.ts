'use client';

import { useQuery } from '@tanstack/react-query';
import { userHqApi } from '@/lib/api/endpoints/territory';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** A field employee's HQ history, current first. Admin and HR. */
export function useUserHq(userId: string) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.userHq.history(userId),
      fetch: (token, signal) => userHqApi.history(token, userId, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** Setting an HQ ends the previous one. Holidays that apply to the employee change with it, so leave data refetches too, and the employee's profile shows the new HQ and zone. */
export function useSetUserHq(userId: string, onDone: () => void) {
  return useApiMutation<string>({
    call: (token, hqId) => userHqApi.set(token, userId, hqId),
    invalidates: [keys.userHq.history(userId), keys.leaves.root(), keys.users.all()],
    successMessage: 'HQ changed.',
    onSuccess: onDone,
  });
}
