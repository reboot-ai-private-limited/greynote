import type { GeoPoint } from '@greynote/contracts';
import { parsePositiveInt, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { evaluateGeofence } from '@/shared/geo/geofence.js';
import type { GeofenceOutcome } from '../domain/call.entity.js';

/**
 * The server's geofence answer for one call (`sync.md`, *Geofencing*): the distance from the Doctor's or
 * Chemist's stored location against `GEO_FENCE_RADIUS_METERS`, with `GEO_MAX_ACCURACY_METERS` deciding when a
 * weak reading can't be trusted. Both are read from Config on every call, so Admin can change the radius and
 * the next call sees it. A `FAIL` or `UNVERIFIED` flags the call for the manager; it never refuses it.
 */
export class GeofenceEvaluator {
  constructor(private readonly config: ConfigReader) {}

  async evaluate(registered: GeoPoint | null, captured: GeoPoint | null, accuracyMeters: number | null): Promise<GeofenceOutcome> {
    const [radiusMeters, maxAccuracyMeters] = await Promise.all([
      readConfig(this.config, 'GEO_FENCE_RADIUS_METERS', parsePositiveInt(100_000)),
      readConfig(this.config, 'GEO_MAX_ACCURACY_METERS', parsePositiveInt(100_000)),
    ]);
    const result = evaluateGeofence({ registered, captured, accuracyMeters, radiusMeters, maxAccuracyMeters });
    return { ...result, overriddenBy: null, overriddenAt: null, overrideComment: null };
  }
}
