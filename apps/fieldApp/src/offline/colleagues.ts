import { useEffect, useState } from 'react';

import { apiGet } from '@/lib/api';

import { isOnline } from './connectivity';
import { store } from './store';

/**
 * The people an employee can name as "Work With" (GET /identity/work-with): the managers above them and everyone below
 * them in their own reporting tree, active only (changed 2026-11-02). Kept on the phone so the picker works offline, and
 * refreshed with every background sync.
 */
export type Colleague = {
  id: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  label?: string;
};

const KEY = 'colleagues';
const listeners = new Set<() => void>();

export async function loadCachedColleagues(): Promise<Colleague[]> {
  const raw = await store.getMeta(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Colleague[];
  } catch {
    return [];
  }
}

/** Fetches the caller's own tree (upline and downline) from /identity/work-with. A failure keeps what was cached. */
export async function refreshColleagues(): Promise<void> {
  if (!isOnline()) return;
  try {
    type WorkWithCandidate = { id: string; employeeCode: string; name: string; designation: string | null; label: string };
    const source = await apiGet<WorkWithCandidate[]>('/identity/work-with');
    // An empty answer is a real one (nobody above or below), but an empty cache means the same, so there is nothing to write.
    if (source.length === 0 && (await loadCachedColleagues()).length === 0) return;

    const list: Colleague[] = source.map((c) => ({
      id: c.id,
      employeeCode: c.employeeCode,
      name: c.name,
      designation: c.designation,
      label: c.label,
    }));

    await store.setMeta(KEY, JSON.stringify(list));
    listeners.forEach((l) => l());
  } catch {
    // Offline, or the server is unreachable: the cached list stays.
  }
}

/** The cached colleagues, refreshed once when the screen opens. `loaded` is false until the cache has been read. */
export function useColleagues(): { colleagues: Colleague[]; loaded: boolean } {
  const [state, setState] = useState<{ colleagues: Colleague[]; loaded: boolean }>({ colleagues: [], loaded: false });
  useEffect(() => {
    let alive = true;
    const read = () => loadCachedColleagues().then((colleagues) => alive && setState({ colleagues, loaded: true }));
    void read();
    listeners.add(read);
    void refreshColleagues();
    return () => {
      alive = false;
      listeners.delete(read);
    };
  }, []);
  return state;
}
