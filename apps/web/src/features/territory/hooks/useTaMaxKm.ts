'use client';

import { useSettings } from '@/features/settings/hooks/useSettings';

/** `TA_MAX_KM`: the most km paid as TA for a route; null until the settings load. */
export function useTaMaxKm(): number | null {
  const raw = useSettings().data?.find((s) => s.key === 'TA_MAX_KM')?.value;
  const n = Number(raw);
  return raw !== undefined && Number.isFinite(n) && n > 0 ? n : null;
}
