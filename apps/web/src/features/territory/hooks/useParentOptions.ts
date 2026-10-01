'use client';

import { useMemo } from 'react';
import type { SelectOption } from '@/components/ui/Select';
import { useHqs } from './useHqs';
import { useZones } from './useZones';

/** The API caps a page at 100. Parent pickers load one page, which covers an org this size. */
const PICKER_PAGE = { page: 1, pageSize: 100, status: 'active' as const };

function toLookup(items: readonly { id: string; name: string }[] | undefined) {
  const options: SelectOption[] = (items ?? []).map((i) => ({ value: i.id, label: i.name }));
  return { options, nameOf: new Map((items ?? []).map((i) => [i.id, i.name])) };
}

/** Active zones as `Select` options, plus id → name for table cells. */
export function useZoneOptions() {
  const zones = useZones(PICKER_PAGE);
  const lookup = useMemo(() => toLookup(zones.data?.items), [zones.data]);
  return { ...lookup, isLoading: zones.isLoading };
}

/**
 * Active HQs as options. Table cells need names for inactive parents too, so the lookup comes from
 * an unfiltered page; the picker options are the active ones only.
 */
export function useHqOptions() {
  const all = useHqs({ page: 1, pageSize: 100 });
  const lookup = useMemo(() => {
    const items = all.data?.items ?? [];
    return {
      options: items.filter((h) => h.status === 'active').map((h) => ({ value: h.id, label: h.name })),
      nameOf: new Map(items.map((h) => [h.id, h.name])),
    };
  }, [all.data]);
  return { ...lookup, isLoading: all.isLoading };
}
