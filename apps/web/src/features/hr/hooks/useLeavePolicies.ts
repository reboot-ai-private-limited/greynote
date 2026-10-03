'use client';

import { useQuery } from '@tanstack/react-query';
import { hrApi } from '@/lib/api/endpoints/hr';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import { savePolicyChanges, type PolicyChange, type PolicySaveResult } from '../lib/policy';

export function useLeavePolicies() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.hr.policies(),
      fetch: (token, signal) => hrApi.policies(token, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

/**
 * Saves the changed cells one by one. It never throws on a refused cell: the caller gets which were saved and which were not,
 * with the server's message for each, and the grid refetches either way.
 */
export function useSaveLeavePolicies(onResult: (result: PolicySaveResult) => void) {
  return useApiMutation<PolicyChange[], PolicySaveResult>({
    call: (token, changes) => savePolicyChanges((c) => hrApi.setPolicy(token, c.payBandId, c.leaveTypeId, c.days), changes),
    invalidates: [keys.hr.policies()],
    onSuccess: onResult,
  });
}
