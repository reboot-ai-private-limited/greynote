import * as Location from 'expo-location';

import type { GeoPoint } from '@/types/sync';

/** One GPS reading: where the phone is and how sure it is (radius in meters). */
export type GpsFix = { point: GeoPoint; accuracyMeters: number | null };

/**
 * The phone's position at the moment of a call (HLD 01 §2). Returns null when permission is
 * refused, location is off, or no fix arrives in time — the call is then saved without a
 * location and the server marks its geofence `UNVERIFIED`; it never blocks the call.
 */
export async function captureLocation(timeoutMs = 12_000): Promise<GpsFix | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!position) return null;
    return {
      point: { latitude: position.coords.latitude, longitude: position.coords.longitude },
      accuracyMeters: position.coords.accuracy ?? null,
    };
  } catch {
    return null;
  }
}
