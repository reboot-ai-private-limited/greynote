import { useEffect, useState } from 'react';

import { store } from './store';

/**
 * Pull snapshots are stored as `{ version, data }` per source (store.ts). Screens read them
 * through `useCachedSource`, which re-reads whenever a pull stores something new.
 */
const listeners = new Set<() => void>();

export const notifyCacheChanged = () => listeners.forEach((l) => l());

export type CachedValue<T> = { data: T | null; fetchedAt: string | null; loaded: boolean };

export function useCachedSource<T>(source: string): CachedValue<T> {
  const [value, setValue] = useState<CachedValue<T>>({ data: null, fetchedAt: null, loaded: false });
  useEffect(() => {
    let alive = true;
    const load = () =>
      store.getCache(source).then((c) => {
        if (alive) setValue({ data: (c?.data as T) ?? null, fetchedAt: c?.fetchedAt ?? null, loaded: true });
      });
    void load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, [source]);
  return value;
}
