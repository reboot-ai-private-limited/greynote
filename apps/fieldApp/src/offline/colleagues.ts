import { useEffect, useState } from 'react';

import { apiGet } from '@/lib/api';

import { isOnline } from './connectivity';
import { store } from './store';

/**
 * The people an MR can name as "Work With" (GET /identity/colleagues): managers up the chain, peers
 * under the same manager, and the team below. Kept on the phone so the picker works offline, and
 * refreshed with every background sync.
 */
export type Colleague = {
  id: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  relation: 'MANAGER' | 'PEER' | 'TEAM';
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

/** Fetches the list and keeps it. A failure keeps what was cached. */
export async function refreshColleagues(): Promise<void> {
  if (!isOnline()) return;
  try {
    const list = await apiGet<Colleague[]>('/identity/colleagues');
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
