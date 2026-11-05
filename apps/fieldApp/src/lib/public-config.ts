import { useEffect, useSyncExternalStore } from 'react';

import { isOnline, useOnline } from '@/offline/connectivity';
import { store } from '@/offline/store';

import { apiGet } from './api';

/**
 * What the phone reads from `GET /config/public` (the server requires a sign-in despite the name). The last answer is kept for offline use.
 * `managerCanAddDoctors` / `managerCanAddChemists` say whether a manager (anyone with a team) may add a doctor / chemist
 * (docs/mobile/doctors.md rule 1, docs/mobile/chemists.md rule 1). Both default to `false`, the server's default, until read.
 */
export type PublicFlags = { managerCanAddDoctors: boolean; managerCanAddChemists: boolean };

const META = 'config:publicFlags';
const REFRESH_MS = 60_000;
const OFF: PublicFlags = { managerCanAddDoctors: false, managerCanAddChemists: false };

let flags: PublicFlags = OFF;
let fetchedAt = 0;
let loading: Promise<void> | null = null;
let restored = false;
const listeners = new Set<() => void>();

const set = (next: PublicFlags) => {
  if (next.managerCanAddDoctors === flags.managerCanAddDoctors && next.managerCanAddChemists === flags.managerCanAddChemists) return;
  flags = next;
  listeners.forEach((l) => l());
};

async function refresh() {
  if (loading) return loading;
  if (!restored) {
    restored = true;
    try {
      const raw = await store.getMeta(META);
      if (raw) set({ ...OFF, ...(JSON.parse(raw) as Partial<PublicFlags>) });
    } catch {
      /* no copy yet */
    }
  }
  if (!isOnline() || Date.now() - fetchedAt < REFRESH_MS) return;
  loading = (async () => {
    try {
      const c = await apiGet<Partial<PublicFlags>>('/config/public', { auth: true });
      const next: PublicFlags = {
        managerCanAddDoctors: c.managerCanAddDoctors === true,
        managerCanAddChemists: c.managerCanAddChemists === true,
      };
      fetchedAt = Date.now();
      set(next);
      await store.setMeta(META, JSON.stringify(next)).catch(() => undefined);
    } catch {
      /* keep the copy */
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The public flags; re-read when the screen opens and when the phone comes back online. */
export function usePublicFlags(): PublicFlags {
  const online = useOnline();
  useEffect(() => {
    void refresh();
  }, [online]);
  return useSyncExternalStore(subscribe, () => flags);
}
