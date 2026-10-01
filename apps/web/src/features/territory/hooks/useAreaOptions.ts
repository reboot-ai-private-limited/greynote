'use client';

import { useMemo } from 'react';
import { useAreas } from './useAreas';
import { useHqOptions } from './useParentOptions';

/**
 * Areas for a route's picker and for naming a row's Area/HQ. The label is "HQ · Area" because an
 * area name alone is ambiguous across HQs. One page of 100 (the API's cap), as for the other pickers.
 */
export function useAreaOptions() {
  const areas = useAreas({ page: 1, pageSize: 100 });
  const hqs = useHqOptions();

  return useMemo(() => {
    const items = areas.data?.items ?? [];
    const label = (hqId: string, name: string) => `${hqs.nameOf.get(hqId) ?? '—'} · ${name}`;
    return {
      options: items.filter((a) => a.status === 'active').map((a) => ({ value: a.id, label: label(a.hqId, a.name) })),
      /** Area id → its name, HQ id and HQ name, for table cells. */
      areaOf: new Map(items.map((a) => [a.id, { name: a.name, hqId: a.hqId, hqName: hqs.nameOf.get(a.hqId), type: a.type }])),
      hqOptions: hqs.options,
      isLoading: areas.isLoading || hqs.isLoading,
    };
  }, [areas.data, areas.isLoading, hqs.nameOf, hqs.options, hqs.isLoading]);
}
