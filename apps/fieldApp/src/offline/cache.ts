import { useEffect, useState } from 'react';

import { store } from './store';

/**
 * Pull snapshots are stored as `{ version, data }` per source (store.ts). Screens read them
 * through `useCachedSource`, which re-reads whenever a pull stores something new.
 *
 * Each source is read and parsed once and that one copy is shared by every screen showing it (Home alone shows `planning` three
 * times), so treat `data` as read-only. A pull drops only the sources it replaced; a source it confirmed unchanged keeps its copy
 * and just takes the new `fetchedAt`. Screens showing other sources aren't touched, and a screen given the same copy doesn't redraw.
 */
export type CachedValue<T> = { data: T | null; fetchedAt: string | null; loaded: boolean };

const EMPTY: CachedValue<never> = { data: null, fetchedAt: null, loaded: false };

/** The read of each source, in flight or done. */
const reads = new Map<string, Promise<CachedValue<unknown>>>();
/** Finished reads, so a screen opening later starts with the data instead of a blank first frame. */
const ready = new Map<string, CachedValue<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function read(source: string): Promise<CachedValue<unknown>> {
  const held = reads.get(source);
  if (held) return held;
  const p = store.getCache(source).then((c): CachedValue<unknown> => ({ data: c?.data ?? null, fetchedAt: c?.fetchedAt ?? null, loaded: true }));
  reads.set(source, p);
  p.then(
    (v) => {
      // A pull may have replaced this read while it ran; only the current one counts.
      if (reads.get(source) === p) ready.set(source, v);
    },
    () => {
      if (reads.get(source) === p) reads.delete(source); // try again next time
    },
  );
  return p;
}

/**
 * After a pull: `updated` sources are read again, `touched` ones (confirmed unchanged) keep their data with `fetchedAt` = `at`.
 * With no argument (the store was wiped), everything is dropped and every screen reads again.
 */
export function notifyCacheChanged(change?: { updated: string[]; touched: string[]; at: string }): void {
  if (!change) {
    reads.clear();
    ready.clear();
    listeners.forEach((set) => set.forEach((l) => l()));
    return;
  }
  for (const source of change.updated) {
    reads.delete(source);
    ready.delete(source);
  }
  for (const source of change.touched) {
    const held = ready.get(source);
    if (held) {
      const next = { ...held, fetchedAt: change.at };
      ready.set(source, next);
      reads.set(source, Promise.resolve(next));
    } else {
      reads.delete(source); // still being read: read it again
    }
  }
  for (const source of [...change.updated, ...change.touched]) listeners.get(source)?.forEach((l) => l());
}

export function useCachedSource<T>(source: string): CachedValue<T> {
  const [value, setValue] = useState<CachedValue<T>>(() => (ready.get(source) as CachedValue<T> | undefined) ?? EMPTY);
  useEffect(() => {
    let alive = true;
    // Only the newest read may land: an older one finishing late would put stale data back.
    let latest = 0;
    const load = () => {
      const n = ++latest;
      read(source).then(
        (v) => {
          if (alive && n === latest) setValue(v as CachedValue<T>);
        },
        () => {},
      );
    };
    load();
    let set = listeners.get(source);
    if (!set) listeners.set(source, (set = new Set()));
    set.add(load);
    return () => {
      alive = false;
      set.delete(load);
    };
  }, [source]);
  return value;
}
