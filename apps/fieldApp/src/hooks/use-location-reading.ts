import { useCallback, useState } from 'react';

import { captureLocation, type GpsFix } from '@/lib/location';
import { evaluateGeofence, getNumberSetting, type GeofenceResult } from '@/offline';
import type { GeoPoint } from '@/types/sync';

/** One GPS reading taken on purpose (Refresh location), checked against the place it was taken for. */
export type LocationReading = {
  fix: GpsFix | null;
  /** The doctor or chemist the reading was checked against (`null` = just a reading, as when adding a place). */
  placeId: string | null;
  /** The check against that place's registered location; `null` when none was asked for. */
  result: GeofenceResult | null;
  /** The limits in force when it was taken. */
  radiusMeters: number;
  maxAccuracyMeters: number;
  /** "14:32", shown instead of an age so nothing ticks. */
  takenAt: string;
  /** When it was taken, for "still fresh enough to save with". */
  takenMs: number;
};

const FRESH_MS = 2 * 60_000;
const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * The location card's state: the latest GPS reading and its check against a place. `refresh` takes a new reading now (GPS needs no internet); `fresh` is the reading
 * Save may use without asking GPS again (under two minutes old, and for the place still chosen).
 */
export function useLocationReading() {
  const [reading, setReading] = useState<LocationReading | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (place?: { id: string; point: GeoPoint | null }): Promise<LocationReading> => {
    setBusy(true);
    try {
      const [fix, radiusMeters, maxAccuracyMeters] = await Promise.all([captureLocation(), getNumberSetting('GEO_FENCE_RADIUS_METERS'), getNumberSetting('GEO_MAX_ACCURACY_METERS')]);
      const now = new Date();
      const next: LocationReading = {
        fix,
        placeId: place?.id ?? null,
        result: place ? evaluateGeofence({ registered: place.point, captured: fix?.point ?? null, accuracyMeters: fix?.accuracyMeters ?? null, radiusMeters, maxAccuracyMeters }) : null,
        radiusMeters,
        maxAccuracyMeters,
        takenAt: clock(now),
        takenMs: now.getTime(),
      };
      setReading(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);

  const fresh = (placeId: string | null): GpsFix | null => (reading?.fix && reading.placeId === placeId && Date.now() - reading.takenMs < FRESH_MS ? reading.fix : null);

  return { reading, busy, refresh, fresh };
}
