/**
 * How often the phone refreshes its lists from the server (2026-11-27). The sync used to schedule itself again every 5 s, forever; now:
 * on sign-in and reconnect, on returning to the app after 15+ minutes away, every 15 minutes while open, and shortly after a save when the
 * last pull is over a minute old; every minute while today's Daily Plan waits for approval. After an error, attempts back off from 30 s up to 15 minutes. Pull-to-refresh always pulls.
 */
export const PULL_EVERY_MS = 15 * 60_000;
/** While today's Daily Plan waits for approval (2026-11-28): a pull this often, so the day opens soon after the manager approves. */
export const PULL_WHILE_WAITING_MS = 60_000;
/** After a save: send at once, but pull again only if the last pull is older than this. */
export const PULL_AFTER_SAVE_MS = 60_000;
/** `refreshNow()` straight after another pull reuses it. */
export const PULL_REUSE_MS = 10_000;

/** Whether a pull is due: never pulled, or the last one is at least `maxAgeMs` old. `maxAgeMs` 0 = always. */
export function pullDue(lastPullAt: string | null, now: number, maxAgeMs: number): boolean {
  if (maxAgeMs <= 0 || !lastPullAt) return true;
  const last = Date.parse(lastPullAt);
  return !Number.isFinite(last) || now - last >= maxAgeMs;
}

/** How long to wait after `failures` failed syncs in a row: 30 s, 1 min, 2 min, … capped at 15 min. 0 after a success. */
export function backoffMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(30_000 * 2 ** (failures - 1), PULL_EVERY_MS);
}
