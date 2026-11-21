'use client';

import type { MarkSampleRequestDoneDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { fieldActivityApi } from '@/lib/api/endpoints/fieldActivity';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** Admin, Accounts, HR: every sample and LBL request, newest first. */
export function useSampleRequests(query: { status?: 'REQUESTED' | 'DONE' | 'CANCELLED' | undefined; kind?: 'SAMPLE' | 'LBL' | undefined }) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.sampleRequests.list(query),
      fetch: (token, signal) => fieldActivityApi.sampleRequests(token, query, signal),
      staleTime: staleTime.live,
    }),
  );
}

export function useMarkSampleRequestDone(onDone: () => void) {
  return useApiMutation<{ id: string; body: MarkSampleRequestDoneDto }, unknown>({
    call: (token, { id, body }) => fieldActivityApi.markSampleRequestDone(token, id, body),
    invalidates: [keys.sampleRequests.all()],
    successMessage: 'Marked done. The employee is credited.',
    onSuccess: onDone,
  });
}
