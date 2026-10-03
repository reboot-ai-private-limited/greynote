'use client';

import type { ApprovalDetailDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { approvalsApi, type InboxQuery } from '@/lib/api/endpoints/approvals';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

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

export type DecisionAction = 'approve' | 'reject' | 'reopen';

export interface DecisionInput {
  /** The round the person was looking at: a request resubmitted since is a 409 that says to reload. */
  cycle: number;
  comment: string;
}

const DONE: Record<DecisionAction, string> = { approve: 'Approved.', reject: 'Rejected.', reopen: 'Reopened for changes.' };

/**
 * Approve, reject or reopen one request. Everything under `approvals` refetches, even on a refusal,
 * so a lost race (409) leaves the screen showing what is actually there.
 */
export function useDecision(requestId: string, action: DecisionAction, onDone: () => void) {
  return useApiMutation<DecisionInput>({
    call: (token, { cycle, comment }) => {
      const text = comment.trim();
      switch (action) {
        case 'approve':
          return approvalsApi.approve(token, requestId, { cycle, ...(text !== '' && { comment: text }) });
        case 'reject':
          return approvalsApi.reject(token, requestId, { cycle, comment: text });
        case 'reopen':
          return approvalsApi.reopen(token, requestId, { comment: text });
      }
    },
    invalidates: [keys.approvals.all()],
    successMessage: DONE[action],
    onSuccess: onDone,
  });
}
