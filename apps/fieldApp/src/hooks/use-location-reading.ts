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
 * Why a reading can't be saved as a doctor's or chemist's location, in words that say what to do next, or `null` when it can. Used by Save so the
 * message sits on the location card instead of the top of the form.
 */
export function locationProblem(reading: LocationReading | null, noun: 'doctor' | 'chemist', now = Date.now()): string | null {
  const where = noun === 'doctor' ? 'doctor’s place' : 'chemist’s shop';
  if (!reading) return `Tap Refresh location first, at the ${where}. Its location is saved from that reading, so check it says ✓ before you save.`;
  if (!reading.fix) return 'No GPS reading. Turn on location (GPS), allow it for this app, and tap Refresh location again.';
  const ageMin = Math.floor((now - reading.takenMs) / 60_000);
  if (now - reading.takenMs >= FRESH_MS) return `Your location reading is ${ageMin} min old. Tap Refresh location again.`;
  const accuracy = reading.fix.accuracyMeters;
  if (accuracy === null || accuracy > reading.maxAccuracyMeters) {
    return `Still weak (${accuracy === null ? 'accuracy unknown' : `±${Math.round(accuracy)} m`}, it needs ±${reading.maxAccuracyMeters} m or better). Move into the open at the ${where} and tap Refresh location again.`;
  }
  return null;
}

/**
 * Why a call or follow-up can't be saved from the current reading, or `null` when it can: no reading for this doctor or chemist yet, an old one, no GPS,
 * a weak one, no registered location, or too far from the place. Says what to do next, and goes on the location card (red) rather than the top of the form.
 */
export function callLocationProblem(reading: LocationReading | null, outletId: string, noun: 'doctor' | 'chemist', now = Date.now()): string | null {
  const mine = reading && reading.placeId === outletId ? reading : null;
  if (!mine) return `Tap Refresh location first, at the ${noun}’s place. A call is saved only from a reading taken there.`;
  if (!mine.fix) return 'No GPS reading. Turn on location (GPS), allow it for this app, and tap Refresh location again.';
  if (now - mine.takenMs >= FRESH_MS) return `Your location reading is ${Math.floor((now - mine.takenMs) / 60_000)} min old. Tap Refresh location again.`;
  const r = mine.result;
  if (!r || r.status === 'PASS') return null;
  if (r.reason === 'NO_REGISTERED_LOCATION') return `This ${noun} has no registered location yet. Ask Admin to set it, then tap Check again.`;
  if (r.reason === 'LOW_ACCURACY') {
    const accuracy = mine.fix.accuracyMeters;
    return `Still weak (${accuracy === null ? 'accuracy unknown' : `±${Math.round(accuracy)} m`}, it needs ±${mine.maxAccuracyMeters} m or better). Move into the open at the ${noun}’s place and tap Refresh location again.`;
  }
  return `You are ${r.distanceMeters ?? '?'} m from the ${noun}’s place; the limit is ${mine.radiusMeters} m. Go closer and tap Refresh location again.`;
}

/**
 * The location card's state: the latest GPS reading and its check against a place. `refresh` listens to the GPS for a better reading (up to ~20 s; GPS needs no
 * internet) and keeps the most accurate one; `progress` is the best accuracy so far while it runs. `fresh` is the reading Save may use without asking GPS again
 * (under two minutes old, and for the place still chosen).
 */
export function useLocationReading() {
  const [reading, setReading] = useState<LocationReading | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const refresh = useCallback(async (place?: { id: string; point: GeoPoint | null }): Promise<LocationReading> => {
    setBusy(true);
    setProgress(null);
    try {
      const [radiusMeters, maxAccuracyMeters] = await Promise.all([getNumberSetting('GEO_FENCE_RADIUS_METERS'), getNumberSetting('GEO_MAX_ACCURACY_METERS')]);
      const fix = await captureLocation({ maxAccuracyMeters, onProgress: setProgress });
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
      setProgress(null);
    }
  }, []);

  const fresh = (placeId: string | null): GpsFix | null => (reading?.fix && reading.placeId === placeId && Date.now() - reading.takenMs < FRESH_MS ? reading.fix : null);

  return { reading, busy, progress, refresh, fresh };
}
