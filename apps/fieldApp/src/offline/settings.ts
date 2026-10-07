import { store } from './store';

/**
 * Admin-editable rules the server sends in the `config` pull source (the allow-list in
 * apps/api/src/syncSources.ts). Read from the local cache so they work offline; the fallbacks
 * are the server's seeded defaults and only apply before the first successful pull.
 */
const DEFAULTS = {
  SYNC_MAX_BATCH: 100,
  SYNC_MAX_DRAFT_BYTES: 65_536,
  SYNC_MAX_DRAFTS: 2000,
  SYNC_MAX_AGE_DAYS: 7,
  SYNC_CLOCK_SKEW_MINUTES: 10,
  GEO_FENCE_RADIUS_METERS: 100,
  GEO_MAX_ACCURACY_METERS: 100,
} as const;

export type NumericSetting = keyof typeof DEFAULTS;

export async function getNumberSetting(key: NumericSetting): Promise<number> {
  const cached = await store.getCache('config');
  const raw = (cached?.data as { settings?: Record<string, string> } | undefined)?.settings?.[key];
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(value) ? value : DEFAULTS[key];
}

export async function getStringSetting(key: string): Promise<string | null> {
  const cached = await store.getCache('config');
  return (cached?.data as { settings?: Record<string, string> } | undefined)?.settings?.[key] ?? null;
}
