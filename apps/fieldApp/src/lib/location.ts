import * as Location from 'expo-location';

import type { GeoPoint } from '@/types/sync';

/** One GPS reading: where the phone is and how sure it is (radius in meters). */
export type GpsFix = { point: GeoPoint; accuracyMeters: number | null };

/** A reading this accurate (meters) is good enough to stop waiting for a better one. */
const GOOD_ENOUGH_METERS = 20;
/** The most the phone keeps listening to the GPS before it hands back the best reading it has. */
const DEFAULT_WINDOW_MS = 20_000;
/** A reading older than this is a cached one, not where the phone is now. */
const MAX_FIX_AGE_MS = 10_000;

export type CaptureOptions = {
  /** `GEO_MAX_ACCURACY_METERS` (System Config, any value). Waiting stops early at the smaller of this and 20 m. */
  maxAccuracyMeters?: number;
  /** How long to keep listening for a better reading. */
  timeoutMs?: number;
  /** Called with the best accuracy so far (meters) each time a better reading arrives. */
  onProgress?: (accuracyMeters: number) => void;
};

/**
 * The phone's position at the moment of a call or an added place (HLD 01 §2). The first GPS reading is often a coarse
 * network or cached one (±hundreds of meters), so this listens for up to ~20 s and returns the **most accurate** fresh
 * reading, stopping early once it is good enough. Readings that are old or from a mock-location app are ignored.
 * Returns null when permission is refused, location is off, or no usable reading arrives — the caller decides what an
 * inaccurate reading is worth (it never trusts one worse than `GEO_MAX_ACCURACY_METERS`).
 */
export async function captureLocation(options: CaptureOptions = {}): Promise<GpsFix | null> {
  const { maxAccuracyMeters, timeoutMs = DEFAULT_WINDOW_MS, onProgress } = options;
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;
    const goal = Math.min(maxAccuracyMeters ?? GOOD_ENOUGH_METERS, GOOD_ENOUGH_METERS);

    return await new Promise<GpsFix | null>((resolve) => {
      let best: GpsFix | null = null;
      let subscription: Location.LocationSubscription | null = null;
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        subscription?.remove();
        resolve(best);
      };
      const timer = setTimeout(finish, timeoutMs);

      Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, (position) => {
        if (done || position.mocked) return;
        if (Date.now() - position.timestamp > MAX_FIX_AGE_MS) return;
        const accuracy = position.coords.accuracy ?? null;
        const better = !best || (accuracy !== null && (best.accuracyMeters === null || accuracy < best.accuracyMeters));
        if (!better) return;
        best = { point: { latitude: position.coords.latitude, longitude: position.coords.longitude }, accuracyMeters: accuracy };
        if (accuracy !== null) {
          onProgress?.(accuracy);
          if (accuracy <= goal) finish();
        }
      })
        .then((sub) => {
          if (done) sub.remove();
          else subscription = sub;
        })
        .catch(finish);
    });
  } catch {
    return null;
  }
}
