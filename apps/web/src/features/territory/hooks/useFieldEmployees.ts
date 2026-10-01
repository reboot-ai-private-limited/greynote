'use client';

import { useQuery } from '@tanstack/react-query';
import { identityApi } from '@/lib/api/endpoints/identity';
import { timing } from '@/lib/hooks/timing';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

/** FIELD-role employees matching a search, for the "assign an MR" picker. */
export function useFieldEmployees(term: string, enabled: boolean) {
  const debounced = useDebouncedValue(term.trim(), timing.searchDebounceMs);
  const query = { role: 'FIELD' as const, page: 1, pageSize: 20, ...(debounced && { search: debounced }) };
  return useQuery(
    authedQueryOptions({
      queryKey: keys.fieldEmployees.search(debounced),
      fetch: (token, signal) => identityApi.users(token, query, signal),
      staleTime: staleTime.live,
      enabled,
    }),
  );
}
