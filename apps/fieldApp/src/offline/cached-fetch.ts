import { useCallback, useEffect, useState } from 'react';

import { useSessionUser } from '@/lib/session';

import { useOnline } from './connectivity';
import { store } from './store';

/**
 * Online data the phone keeps a copy of (visuals, orders…), so the screen still shows
 * something with no signal. Fetches whenever it is online; a failed fetch keeps the copy and says why.
 * The copy is kept per signed-in employee, so a shared phone never shows someone else's.
 */
export type CachedFetch<T> = {
  data: T | null;
  /** When the copy on screen was fetched (ISO), or null if nothing has been fetched yet. */
  fetchedAt: string | null;
  loading: boolean;
  error: string | null;
  /** True when what is shown is the phone's copy rather than a fresh answer. */
  stale: boolean;
  /** True only while a reload the person asked for (pull down) is running — not when the key changes, e.g. a new month. */
  refreshing: boolean;
  reload: () => void;
};

/** `refreshKey` is anything that should trigger a fresh fetch when it changes (e.g. how many records have synced). */
export function useCachedFetch<T>(key: string, fetcher: () => Promise<T>, refreshKey?: unknown): CachedFetch<T> {
  const online = useOnline();
  const userId = useSessionUser()?.id ?? 'anon';
  const metaKey = `fetch:${userId}:${key}`;
  const [state, setState] = useState<{ key: string; data: T | null; fetchedAt: string | null; loading: boolean; error: string | null; stale: boolean }>({
    key: metaKey,
    data: null,
    fetchedAt: null,
    loading: true,
    error: null,
    stale: true,
  });
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      let held: { data: T; fetchedAt: string } | null = null;
      try {
        const raw = await store.getMeta(metaKey);
        if (raw) held = JSON.parse(raw) as { data: T; fetchedAt: string };
      } catch {
        held = null;
      }
      if (!alive) return;
      // A new key (another month…) starts from its own copy, or from nothing — never from the previous key's data.
      setState(held ? { key: metaKey, data: held.data, fetchedAt: held.fetchedAt, loading: online, error: null, stale: true } : { key: metaKey, data: null, fetchedAt: null, loading: online, error: null, stale: true });
      if (!online) {
        setState((s) => ({ ...s, loading: false }));
        setRefreshing(false);
        return;
      }
      try {
        const data = await fetcher();
        const fetchedAt = new Date().toISOString();
        await store.setMeta(metaKey, JSON.stringify({ data, fetchedAt })).catch(() => undefined);
        if (alive) setState({ key: metaKey, data, fetchedAt, loading: false, error: null, stale: false });
      } catch (err) {
        if (alive) setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Could not load.' }));
      } finally {
        if (alive) setRefreshing(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaKey, online, tick, refreshKey]);

  const reload = useCallback(() => {
    setRefreshing(true);
    setTick((t) => t + 1);
  }, []);
  // Until the effect has run for a new key, show that key as empty and loading rather than the last key's data.
  const current = state.key === metaKey ? state : { key: metaKey, data: null, fetchedAt: null, loading: true, error: null, stale: true };
  return { data: current.data, fetchedAt: current.fetchedAt, loading: current.loading, error: current.error, stale: current.stale, refreshing, reload };
}
