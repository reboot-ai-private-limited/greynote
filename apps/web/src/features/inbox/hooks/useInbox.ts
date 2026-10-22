'use client';

import type { PublishInboxMessageDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { identityApi } from '@/lib/api/endpoints/identity';
import { inboxApi, type ListSentQuery } from '@/lib/api/endpoints/inbox';
import { timing } from '@/lib/hooks/timing';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import { messageForm } from '../lib/inbox';

/** Messages sent, newest first. Read counts move as people open them, so they are not held fresh. */
export function useSentMessages(query: ListSentQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.inbox.sent(query),
      fetch: (token, signal) => inboxApi.sent(token, query, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** Active employees of any role matching a search, for naming people in the audience. */
export function useMessageRecipients(term: string, enabled: boolean) {
  const debounced = useDebouncedValue(term.trim(), timing.searchDebounceMs);
  const query = { status: 'active' as const, page: 1, pageSize: 20, ...(debounced && { search: debounced }) };
  return useQuery(
    authedQueryOptions({
      queryKey: keys.users.list(query),
      fetch: (token, signal) => identityApi.users(token, query, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

export function usePublishMessage(onDone: () => void) {
  return useApiMutation<{ body: PublishInboxMessageDto; files: File[] }, { id: string; recipientCount: number }>({
    call: (token, { body, files }) => inboxApi.publish(token, messageForm(body, files)),
    invalidates: [keys.inbox.all()],
    onSuccess: onDone,
  });
}

export function useRetractMessage(onDone: () => void) {
  return useApiMutation<string>({
    call: (token, id) => inboxApi.retract(token, id),
    invalidates: [keys.inbox.all()],
    successMessage: 'Message taken back.',
    onSuccess: onDone,
  });
}
