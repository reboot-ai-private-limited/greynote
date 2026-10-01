'use client';

import { useMemo } from 'react';
import { useHqs } from './useHqs';
import { useZones } from './useZones';

/** The API caps a page at 100. Parent pickers load one page, which covers an org this size. */
const PICKER_PAGE = { page: 1, pageSize: 100 };

/**
 * Zones for pickers and for naming a row's parent. Names come from every zone (an inactive parent
 * still has a name to show); the picker options are the active ones only.
 */
export function useZoneOptions() {
  const zones = useZones(PICKER_PAGE);
  const lookup = useMemo(() => {
    const items = zones.data?.items ?? [];
    return {
      options: items.filter((z) => z.status === 'active').map((z) => ({ value: z.id, label: z.name })),
      nameOf: new Map(items.map((z) => [z.id, z.name])),
    };
  }, [zones.data]);
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
      zoneIdOf: new Map(items.map((h) => [h.id, h.zoneId])),
    };
  }, [all.data]);
  return { ...lookup, isLoading: all.isLoading };
}
