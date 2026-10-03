'use client';

import type { ApprovalDetailDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { approvalsApi, type InboxQuery } from '@/lib/api/endpoints/approvals';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export type ApprovalView = 'waiting' | 'history';

/** The open queue, or the History. Both are live data other people change, so neither is held fresh. */
export function useApprovals(view: ApprovalView, query: InboxQuery, enabled = true) {
  return useQuery(
    authedQueryOptions({
      queryKey: view === 'waiting' ? keys.approvals.inbox(query) : keys.approvals.history(query),
      fetch: (token, signal) => (view === 'waiting' ? approvalsApi.inbox(token, query, signal) : approvalsApi.all(token, query, signal)),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}

export function useApproval(id: string) {
  return useQuery<ApprovalDetailDto>(
    authedQueryOptions({
      queryKey: keys.approvals.detail(id),
      fetch: (token, signal) => approvalsApi.detail(token, id, signal),
      staleTime: staleTime.live,
    }),
  );
}
