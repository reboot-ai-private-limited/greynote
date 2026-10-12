'use client';

import type { AllowLateLeaveApprovalDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { hrApi, type ListLeavesQuery } from '@/lib/api/endpoints/hr';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';

/** Everyone's leaves, newest first. Other people submit and decide them, so it is not held fresh. */
export function useAllLeaves(query: ListLeavesQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.leaves.all(query),
      fetch: (token, signal) => hrApi.allLeaves(token, query, signal),
      staleTime: staleTime.live,
    }),
  );
}

/** Admin: let one leave that has already started be approved, once. Approvals and leaves both change. */
export function useAllowLateLeaveApproval(leaveId: string, onDone: () => void) {
  return useApiMutation<AllowLateLeaveApprovalDto>({
    call: (token, body) => hrApi.allowLateApproval(token, leaveId, body),
    invalidates: [keys.leaves.root()],
    successMessage: 'Late approval allowed.',
    onSuccess: onDone,
  });
}
