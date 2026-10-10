import { useEffect, useState } from 'react';

import type { GpsFix } from '@/lib/location';
import { localGeofence } from '@/offline/calls';
import type { GeofenceResult } from '@/offline/geofence';
import type { GeoPoint } from '@/types/sync';

import { ThemedText } from './themed-text';

const TEXT: Record<GeofenceResult['status'], string> = {
  PASS: 'Location matched',
  FAIL: 'Away from the registered location',
  UNVERIFIED: 'Location not verified',
};

/** One line saying whether the call's GPS matched the registered place. A flag for the manager, never a block. */
export function GeofenceBadge({
  result,
  registered,
  captured,
  accuracyMeters,
}: {
  /** The server's answer, once the call has synced; it wins over the phone's own. */
  result?: GeofenceResult | null;
  registered?: GeoPoint | null;
  captured?: GeoPoint | null;
  accuracyMeters?: number | null;
}) {
  const [own, setOwn] = useState<GeofenceResult | null>(null);
  useEffect(() => {
    if (result) return;
    const fix: GpsFix | null = captured ? { point: captured, accuracyMeters: accuracyMeters ?? null } : null;
    void localGeofence(registered ?? null, fix).then(setOwn);
  }, [result, registered, captured, accuracyMeters]);

  const r = result ?? own;
  if (!r) return null;
  const tone = r.status === 'PASS' ? 'primary' : r.status === 'FAIL' ? 'danger' : 'warning';
  const distance = r.distanceMeters !== null ? ` · ${r.distanceMeters} m` : '';
  return (
    <ThemedText type="small" themeColor={tone}>
      {`${TEXT[r.status]}${distance}`}
    </ThemedText>
  );
}
