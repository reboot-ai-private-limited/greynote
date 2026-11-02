import type { BulkGrantLateDto, BulkGrantLateResultDto, EligibleEmployeesDto, GrantLateDto, LateGrantKindDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { lateGrantsApi, type ListLateGrantsQuery } from '@/lib/api/endpoints/lateGrants';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** Late-submission exceptions, newest first. They get used up, ended and revoked by others, so they are not held fresh. */
export function useLateGrants(query: ListLateGrantsQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.lateGrants.list(query),
      fetch: (token, signal) => lateGrantsApi.list(token, query, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** Whether a late entry is still possible for this employee and period — and why not. Asked once all three are chosen. */
export function useLateGrantPreview(input: { userId: string; kind: LateGrantKindDto; periodKey: string }, enabled: boolean) {
  return useQuery({
    ...authedQueryOptions({
      queryKey: [...keys.lateGrants.all(), 'preview', input] as const,
      fetch: (token, signal) => lateGrantsApi.preview(token, input, signal),
      staleTime: staleTime.live,
    }),
    enabled,
  });
}

export function useGrantLate(onDone: () => void) {
  return useApiMutation<GrantLateDto>({
    call: (token, body) => lateGrantsApi.grant(token, body),
    // The expense month table marks who has a late exception, so it is refreshed too.
    invalidates: [keys.lateGrants.all(), keys.expenses.all()],
    successMessage: 'Late submission allowed.',
    onSuccess: onDone,
  });
}

export function useBulkGrantLate(onDone: (result: BulkGrantLateResultDto) => void) {
  return useApiMutation<BulkGrantLateDto, BulkGrantLateResultDto>({
    call: (token, body) => lateGrantsApi.bulk(token, body),
    // The expense month table marks who has a late exception, so it is refreshed too.
    invalidates: [keys.lateGrants.all(), keys.expenses.all()],
    onSuccess: onDone,
  });
}

/** The employees a shortcut stands for ("everyone", or one manager's team), fetched when the button is pressed. */
export function useEligibleEmployees(onDone: (userIds: string[]) => void) {
  return useApiMutation<{ scope: 'all' | 'team'; managerId?: string }, EligibleEmployeesDto>({
    call: (token, query) => lateGrantsApi.eligible(token, query),
    onSuccess: (result) => onDone(result.userIds),
  });
}

export function useRevokeLate(onDone: () => void) {
  return useApiMutation<string>({
    call: (token, id) => lateGrantsApi.revoke(token, id),
    // The expense month table marks who has a late exception, so it is refreshed too.
    invalidates: [keys.lateGrants.all(), keys.expenses.all()],
    successMessage: 'Exception revoked.',
    onSuccess: onDone,
  });
}
