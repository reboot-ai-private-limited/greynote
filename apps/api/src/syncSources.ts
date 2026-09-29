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
  'DAILY_PLAN_SUBMIT_CUTOFF_TIME',
  'DAILY_PLAN_RESUBMIT_GRACE_MINUTES',
  'DAILY_PLAN_RESUBMIT_LATEST_TIME',
  'DAILY_PLAN_CHANGE_MAX',
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

export function registerCompositionSyncSources(deps: {
  sync: SyncPublicContract;
  territory: TerritoryPublicContract;
  config: ConfigPublicContract;
}): void {
  deps.sync.registerSource({
    name: 'territory',
    async snapshot(userId) {
      const [routes, place] = await Promise.all([deps.territory.listRoutesForUser(userId), deps.territory.getUserHq(userId)]);
      const [hq, zone] = place ? await Promise.all([deps.territory.getHq(place.hqId), deps.territory.getZone(place.zoneId)]) : [null, null];
      return {
        routes: [...routes]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((r) => ({
            id: r.id,
            name: r.name,
            areaId: r.areaId,
            areaName: r.areaName,
            areaType: r.areaType,
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
    async snapshot() {
      const settings: Record<string, string> = {};
      for (const key of CONFIG_KEYS_FOR_PHONE) settings[key] = await deps.config.get(key);
      return { settings };
    },
  });
}
