import type { ConfigSnapshot, TerritorySnapshot } from '@greynote/contracts';
import type { ConfigPublicContract } from '@/modules/config/config.public.js';
import type { SyncPublicContract } from '@/modules/sync/sync.public.js';
import type { TerritoryPublicContract } from '@/modules/territory/territory.public.js';

/**
 * The phone's cache of Territory and Config (LLD sync.md, Pull), wired here rather than by the modules
 * themselves: a module may only import contracts from tiers *below* its own, and Sync is at Territory's tier
 * and above Config's, so neither can register with it. This file is composition, not logic — it reads two
 * public contracts and shapes what they return.
 */

/** The settings the app needs offline: the geofence, the cutoffs, the calendar, and the sync limits it obeys. */
export const CONFIG_KEYS_FOR_PHONE = [
  'BUSINESS_TIMEZONE',
  'DAY_START_TIME',
  'DAILY_PLAN_SUBMIT_CUTOFF_TIME',
  'DAILY_PLAN_RESUBMIT_GRACE_MINUTES',
  'DAILY_PLAN_RESUBMIT_LATEST_TIME',
  'MONTHLY_PLAN_SUBMIT_CUTOFF_DATE',
  'MONTHLY_PLAN_RESUBMIT_GRACE_HOURS',
  'FY_START_MONTH',
  'WEEKLY_OFF_DAY',
  'GEO_FENCE_RADIUS_METERS',
  'GEO_MAX_ACCURACY_METERS',
  'SYNC_MAX_BATCH',
  'SYNC_MAX_DRAFT_BYTES',
  'SYNC_MAX_DRAFTS',
  'SYNC_MAX_AGE_DAYS',
  'SYNC_CLOCK_SKEW_MINUTES',
] as const;

import { readDayStart } from '@/shared/config/readConfig.js';

export function registerCompositionSyncSources(deps: {
  sync: SyncPublicContract;
  territory: TerritoryPublicContract;
  config: ConfigPublicContract;
}): void {
  deps.sync.registerSource({
    name: 'territory',
    async snapshot(userId): Promise<TerritorySnapshot> {
      const [routes, place] = await Promise.all([deps.territory.listRoutesForUser(userId), deps.territory.getUserHq(userId)]);
      const [hq, zone] = place ? await Promise.all([deps.territory.getHq(place.hqId), deps.territory.getZone(place.zoneId)]) : [null, null];
      return {
        routes: [...routes]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((r) => ({
            id: r.id,
            name: r.name,
            hqId: r.hqId,
            hqName: r.hqName,
            routeType: r.routeType,
            distanceKm: r.distanceKm,
            distanceStatus: r.distanceStatus,
            taPerKmRateOverridePaise: r.taPerKmRateOverridePaise,
          })),
        hq: place && hq && zone ? { hqId: hq.id, hqName: hq.name, zoneId: zone.id, zoneName: zone.name } : null,
      };
    },
  });

  deps.sync.registerSource({
    name: 'config',
    async snapshot(): Promise<ConfigSnapshot> {
      const settings: Record<string, string> = {};
      for (const key of CONFIG_KEYS_FOR_PHONE) {
        // A database not yet re-seeded has no day start: midnight, as before the setting existed.
        settings[key] = key === 'DAY_START_TIME' ? await readDayStart(deps.config) : await deps.config.get(key);
      }
      return { settings };
    },
  });
}
