'use client';

import { useQuery } from '@tanstack/react-query';
import { identityApi } from '@/lib/api/endpoints/identity';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export const ORG_PAGE_SIZE = 25;

/** One page of one level of the organisation tree; `parentId` null is the top. */
export function useOrgChildren(parentId: string | null, page: number) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.org.children(parentId, page),
      fetch: (token, signal) =>
        identityApi.orgChildren(
          token,
          { ...(parentId ? { parentId } : {}), page, pageSize: ORG_PAGE_SIZE },
          signal,
        ),
      staleTime: staleTime.live,
    }),
  );
}
