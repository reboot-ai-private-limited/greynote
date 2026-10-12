import type { GeoPoint } from '@greynote/contracts';
import { parsePositiveInt, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { evaluateGeofence } from '@/shared/geo/geofence.js';
import type { GeofenceOutcome } from '../domain/call.entity.js';
import { LOG_CODES, LogRefusal } from '../domain/logRefusal.js';

/**
 * The server's geofence answer for one call (`sync.md`, *Geofencing*): the distance from the Doctor's or
 * Chemist's stored location against `GEO_FENCE_RADIUS_METERS`, with `GEO_MAX_ACCURACY_METERS` deciding when a
 * weak reading can't be trusted. Both are read from Config on every call, so Admin can change the radius and
 * the next call sees it. Only a `PASS` is recorded: anything else is refused (`NOT_AT_LOCATION`) and nothing is stored.
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

  /** The server's answer, or a refusal: a call or follow-up is only recorded where the Doctor or Chemist is. */
  async requirePass(subject: 'doctor' | 'chemist', registered: GeoPoint | null, captured: GeoPoint | null, accuracyMeters: number | null): Promise<GeofenceOutcome> {
    const outcome = await this.evaluate(registered, captured, accuracyMeters);
    if (outcome.status === 'PASS') return outcome;
    const radius = await readConfig(this.config, 'GEO_FENCE_RADIUS_METERS', parsePositiveInt(100_000));
    const why: Record<string, string> = {
      NO_REGISTERED_LOCATION: `This ${subject} has no registered location yet, so it can’t be recorded. Ask Admin to set it.`,
      NO_GPS_READING: 'Your phone did not give a GPS reading. Turn on location and try again.',
      LOW_ACCURACY: 'Your GPS signal is too weak to confirm where you are. Move to open sky and try again.',
    };
    const message = (outcome.reason && why[outcome.reason]) ?? `You are not at the ${subject}’s location (${outcome.distanceMeters ?? '?'} m away, the limit is ${radius} m).`;
    throw new LogRefusal(LOG_CODES.notAtLocation, message);
  }
}
