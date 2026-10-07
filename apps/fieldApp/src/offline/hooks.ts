import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useSessionUser } from '@/lib/session';

import { onReconnect, startConnectivityWatch } from './connectivity';
import { getSyncStatus, runSync, subscribeSyncStatus } from './engine';
import { countByStatus, subscribeOutbox } from './outbox';
import type { OutboxStatus } from './types';

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
 * Keeps the phone current while a user is signed in: syncs once at start, whenever the phone
 * comes back online, whenever the app returns to the foreground, and shortly after the outbox
 * changes (the draft backup, debounced). Mount once, in the root layout.
 */
export function useAutoSync() {
  const user = useSessionUser();
  const signedIn = !!user;

  useEffect(() => {
    const stopWatch = startConnectivityWatch();
    return stopWatch;
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void runSync();

    const offReconnect = onReconnect(() => void runSync());
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runSync();
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const offOutbox = subscribeOutbox(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void runSync(), 5000);
    });

    return () => {
      offReconnect();
      appState.remove();
      offOutbox();
      clearTimeout(timer);
    };
  }, [signedIn]);
}
