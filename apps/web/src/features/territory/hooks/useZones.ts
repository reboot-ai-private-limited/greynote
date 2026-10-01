'use client';

import { useQuery } from '@tanstack/react-query';
import { zonesApi, type ListZonesQuery } from '@/lib/api/endpoints/territory';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';

export function useZones(query?: ListZonesQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.zones.list(query),
      fetch: (token, signal) => zonesApi.list(token, query, signal),
      staleTime: staleTime.configuration,
    }),
  );
}
