'use client';

import { useMemo } from 'react';
import { useSettings } from '@/features/settings/hooks/useSettings';
import type { StationThresholds } from '../lib/routeDraft';

/** The two km limits that decide Automatic (`EX_STATION_MIN_KM`, `OUT_STATION_MIN_KM`); null until the settings load. */
export function useStationThresholds(): StationThresholds | null {
  const settings = useSettings();
  return useMemo(() => {
    const read = (key: string) => {
      const raw = settings.data?.find((s) => s.key === key)?.value;
      const n = Number(raw);
      return raw !== undefined && Number.isFinite(n) ? n : null;
    };
    const exStationKm = read('EX_STATION_MIN_KM');
    const outStationKm = read('OUT_STATION_MIN_KM');
    return exStationKm === null || outStationKm === null ? null : { exStationKm, outStationKm };
  }, [settings.data]);
}
