import { useEffect, useSyncExternalStore } from 'react';

import { probeHasTeam } from '@/lib/approvals';
import { isOnline, onReconnect } from '@/offline/connectivity';
import { store } from '@/offline/store';

/**
 * Whether the signed-in employee manages anyone, so the Team tab shows (PRD §6.1). The backend has no
 * "has direct reports" flag, so this asks the approvals lists once per sign-in: any team request, past or
 * present, means a manager. The answer is kept on the phone so the tab is steady offline and across launches;
 * it is refreshed whenever the phone reconnects. When the backend adds a flag, `probeHasTeam` is the one thing to swap.
 */
let current: { userId: string | null; value: boolean } = { userId: null, value: false };
let startedFor: string | null = null;
let stopReconnect: (() => void) | null = null;
const listeners = new Set<() => void>();

const KEY = (userId: string) => `isManager:${userId}`;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const publish = (userId: string | null, value: boolean) => {
  current = { userId, value };
  listeners.forEach((l) => l());
};

async function refresh(userId: string) {
  if (!isOnline()) return;
  try {
    const value = await probeHasTeam();
    await store.setMeta(KEY(userId), value ? '1' : '0');
    if (startedFor === userId) publish(userId, value);
  } catch {
    // Keep what the phone already knows; a failed probe must never hide the tab.
  }
}

function start(userId: string) {
  if (startedFor === userId) return;
  startedFor = userId;
  publish(userId, false);
  store
    .getMeta(KEY(userId))
    .then((raw) => {
      if (startedFor === userId && raw === '1') publish(userId, true);
    })
    .catch(() => undefined);
  void refresh(userId);
  stopReconnect?.();
  stopReconnect = onReconnect(() => void refresh(userId));
}

function stop() {
  startedFor = null;
  stopReconnect?.();
  stopReconnect = null;
  if (current.userId !== null) publish(null, false);
}

/** Call from anywhere a signed-in user is known; the first call per user starts the check. */
export function useIsManager(userId: string | null | undefined, role: string | undefined): boolean {
  const snap = useSyncExternalStore(subscribe, () => current);
  useEffect(() => {
    if (userId && role === 'FIELD') start(userId);
    else stop();
  }, [userId, role]);
  return !!userId && snap.userId === userId && snap.value;
}

/** Re-checks now (e.g. after a manager decides a request); safe to call any time. */
export function refreshIsManager() {
  if (startedFor) void refresh(startedFor);
}
