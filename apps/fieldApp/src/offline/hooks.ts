import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useSessionUser } from '@/lib/session';

import type { ConfigSnapshot, PlanningSnapshot } from '@/types/sync';

import { useCachedSource } from './cache';
import { onReconnect, startConnectivityWatch } from './connectivity';
import { businessToday } from './day';
import { getSyncStatus, runSync, subscribeSyncStatus, syncNow } from './engine';
import { PULL_AFTER_SAVE_MS, PULL_EVERY_MS, PULL_WHILE_WAITING_MS } from './sync-pacing';
import { countByStatus, listRecords, subscribeOutbox } from './outbox';
import type { OutboxRecord, OutboxStatus, SyncKind } from './types';

/** Live counts of the day's records by status. Refreshes whenever the outbox changes. */
export function useOutboxCounts(): Record<OutboxStatus, number> {
  const [counts, setCounts] = useState<Record<OutboxStatus, number>>({
    DRAFT: 0,
    QUEUED: 0,
    SYNCED: 0,
    FAILED: 0,
  });
  useEffect(() => {
    let alive = true;
    const refresh = () => countByStatus().then((c) => alive && setCounts(c));
    refresh();
    const unsubscribe = subscribeOutbox(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return counts;
}

export function useSyncStatus() {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus);
}

/**
 * Keeps the phone current while a user is signed in (2026-11-27 pacing, sync-pacing.ts): a full sync at sign-in and when the phone comes
 * back online; on returning to the app when the last pull is 15+ minutes old; every 15 minutes while the app is open; and 5 s after the
 * outbox changes (sends at once, pulls only if the last pull is over a minute old). While today's Daily Plan waits for approval, a pull
 * every minute instead (2026-11-28), so the day opens soon after the manager approves. Mount once, in the root layout.
 */
export function useAutoSync() {
  const user = useSessionUser();
  // The /sync endpoints are FIELD-only; the other roles use the web portal and would get a 403.
  const signedIn = user?.role === 'FIELD';
  const planning = useCachedSource<PlanningSnapshot>('planning');
  const config = useCachedSource<ConfigSnapshot>('config');
  const today = businessToday(config.data?.settings.BUSINESS_TIMEZONE, new Date(), config.data?.settings.DAY_START_TIME);
  const todayStatus = planning.data?.dailyPlans.find((p) => p.planDate === today)?.status ?? null;
  const waiting = todayStatus === 'SUBMITTED' || todayStatus === 'MANAGER_APPROVED';

  useEffect(() => {
    if (!signedIn || !waiting) return;
    const every = setInterval(() => {
      if (AppState.currentState === 'active') void runSync({ pullIfOlderThan: PULL_WHILE_WAITING_MS });
    }, PULL_WHILE_WAITING_MS);
    return () => clearInterval(every);
  }, [signedIn, waiting]);

  useEffect(() => {
    const stopWatch = startConnectivityWatch();
    return stopWatch;
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void runSync({ pullIfOlderThan: 0, force: true });

    const offReconnect = onReconnect(() => void runSync({ pullIfOlderThan: 0, force: true }));
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runSync({ pullIfOlderThan: PULL_EVERY_MS });
    });
    // While the app is in front: a pull every 15 minutes (runSync skips it if one happened since).
    const every = setInterval(() => {
      if (AppState.currentState === 'active') void runSync({ pullIfOlderThan: PULL_EVERY_MS });
    }, PULL_EVERY_MS);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offOutbox = subscribeOutbox(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void runSync({ pullIfOlderThan: PULL_AFTER_SAVE_MS }), 5000);
    });

    return () => {
      offReconnect();
      appState.remove();
      clearInterval(every);
      offOutbox();
      clearTimeout(timer);
    };
  }, [signedIn]);
}

/** Live list of this phone's records of one or more kinds (oldest first). Refreshes when the outbox changes. */
export function useRecords(kinds: SyncKind[]): { records: OutboxRecord[]; loaded: boolean } {
  const [state, setState] = useState<{ records: OutboxRecord[]; loaded: boolean }>({ records: [], loaded: false });
  const key = kinds.join(',');
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      listRecords().then((all) => alive && setState({ records: all.filter((r) => kinds.includes(r.kind)), loaded: true }));
    void refresh();
    const unsubscribe = subscribeOutbox(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/**
 * A sync the user started (2026-11-28): `run()` sends, pulls and, when it can't, leaves a short message for a few seconds. `busy` is only
 * this sync, not a background one, so a pull-down spinner doesn't spin for syncs the user didn't ask for.
 */
export function useSyncNow(): { run: () => Promise<void>; busy: boolean; message: string | null } {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);
  const run = useCallback(async () => {
    setBusy(true);
    try {
      setMessage((await syncNow()).message);
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy, message };
}
