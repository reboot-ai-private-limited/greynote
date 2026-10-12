import { useEffect, useState } from 'react';

import { apiGet } from '@/lib/api';

import { isOnline } from './connectivity';
import { store } from './store';

/**
 * The people an MR can name as "Work With" (GET /identity/work-with): every active manager in the org
 * or all active field employees. Kept on the phone so the picker works offline, and refreshed with every background sync.
 */
export type Colleague = {
  id: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  label?: string;
  isManager?: boolean;
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

/** Fetches both managers and all field employees from /identity/work-with. A failure keeps what was cached. */
export async function refreshColleagues(): Promise<void> {
  if (!isOnline()) return;
  try {
    type WorkWithCandidate = { id: string; employeeCode: string; name: string; designation: string | null; label: string };
    const [managersResult, allResult] = await Promise.allSettled([
      apiGet<WorkWithCandidate[]>('/identity/work-with?scope=managers'),
      apiGet<WorkWithCandidate[]>('/identity/work-with?scope=all'),
    ]);
    // Replace the cached list only with a complete answer: if one of the two requests failed, a half list would silently
    // hide the other group, so the copy already on the phone stays — unless there is none yet, when half is better than nothing.
    const complete = managersResult.status === 'fulfilled' && allResult.status === 'fulfilled';
    if (!complete && (await loadCachedColleagues()).length > 0) return;
    const managers = managersResult.status === 'fulfilled' ? managersResult.value : [];
    const all = allResult.status === 'fulfilled' ? allResult.value : [];
    const managerIds = new Set(managers.map((m) => m.id));
    const source = all.length > 0 ? all : managers;
    if (source.length === 0) return;

    const list: Colleague[] = source.map((c) => ({
      id: c.id,
      employeeCode: c.employeeCode,
      name: c.name,
      designation: c.designation,
      label: c.label,
      isManager: managerIds.has(c.id),
      relation: managerIds.has(c.id) ? 'MANAGER' : 'PEER',
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
