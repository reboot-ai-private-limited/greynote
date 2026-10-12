import type { GrantLateSubmitDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { planningApi, type ListLateGrantsQuery } from '@/lib/api/endpoints/planning';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** Late-submission exceptions, newest first. Others change them (they get used up), so they are not held fresh. */
export function useLateGrants(query: ListLateGrantsQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.lateGrants.list(query),
      fetch: (token, signal) => planningApi.lateGrants(token, query, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useGrantLate(onDone: () => void) {
  return useApiMutation<GrantLateSubmitDto>({
    call: (token, body) => planningApi.grantLate(token, body),
    invalidates: [keys.lateGrants.all()],
    successMessage: 'Late submission allowed.',
    onSuccess: onDone,
  });
}

export function useRevokeLate(onDone: () => void) {
  return useApiMutation<string>({
    call: (token, id) => planningApi.revokeLate(token, id),
    invalidates: [keys.lateGrants.all()],
    successMessage: 'Exception revoked.',
    onSuccess: onDone,
  });
}
