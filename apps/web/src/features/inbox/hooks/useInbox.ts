'use client';

import type { PublishInboxMessageDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { inboxApi, type ListSentQuery } from '@/lib/api/endpoints/inbox';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

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

export function usePublishMessage(onDone: () => void) {
  return useApiMutation<PublishInboxMessageDto, { id: string; recipientCount: number }>({
    call: (token, body) => inboxApi.publish(token, body),
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
