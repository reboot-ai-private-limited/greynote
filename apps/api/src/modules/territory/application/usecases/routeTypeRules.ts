import { readConfig, parsePositiveInt, type ConfigReader } from '@/shared/config/readConfig.js';
import { routeTypeWarning, type StationThresholds } from '../../domain/routeType.js';
import type { Route } from '../../domain/route.entity.js';

/** A Route with the sentence to show beside a type that disagrees with its distance (null when it agrees). */
export type RouteWithWarning = Route & { typeWarning: string | null };

/** Reads the two station distances from Config and applies them. Territory's only view of those settings. */
export class RouteTypeRules {
  constructor(private readonly config: ConfigReader) {}

  async thresholds(): Promise<StationThresholds> {
    return {
      exStationKm: await readConfig(this.config, 'EX_STATION_MIN_KM', parsePositiveInt(5000)),
      outStationKm: await readConfig(this.config, 'OUT_STATION_MIN_KM', parsePositiveInt(5000)),
    };
  }

  async annotate(route: Route): Promise<RouteWithWarning> {
    return { ...route, typeWarning: routeTypeWarning(route, await this.thresholds()) };
  }
}
