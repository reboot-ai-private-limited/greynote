import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useOnline } from '@/offline';
import { store } from '@/offline/store';

import { ApiError, apiGet, apiPost } from './api';
import { useSessionUser } from './session';

/**
 * The inbox the Admin writes to (docs/mobile/inbox.md). The server decides who has what and what is read; the phone only
 * reads the list and tells the server what was opened. It is current mail, not a record of a year, so no financial-year header.
 */
export type InboxKind = 'ANNOUNCEMENT' | 'REMINDER' | 'POLICY' | 'UPDATE';

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  kind: InboxKind;
  sentAt: string;
  expiresAt: string | null;
  read: boolean;
  readAt: string | null;
};

export const KIND_LABEL: Record<InboxKind, string> = { ANNOUNCEMENT: 'Announcement', REMINDER: 'Reminder', POLICY: 'Policy', UPDATE: 'Update' };

export const listInbox = async () => (await apiGet<{ items: InboxItem[]; total: number }>('/inbox?pageSize=100', { auth: true })).items;

export const getUnreadCount = async () => (await apiGet<{ unread: number }>('/inbox/unread-count', { auth: true })).unread;

export const markInboxRead = (id: string) => apiPost<unknown>(`/inbox/${id}/read`, {}, { auth: true });

export const markAllInboxRead = () => apiPost<unknown>('/inbox/read-all', {}, { auth: true });

/* ── reads made while offline: an unsent read is only a missing tick, so keep the ids and send them when back online ── */

const pendingKey = (userId: string) => `inbox:pendingRead:${userId}`;

async function loadPending(userId: string): Promise<string[]> {
  try {
    const raw = await store.getMeta(pendingKey(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function queueRead(userId: string, id: string) {
  const ids = await loadPending(userId);
  if (!ids.includes(id)) await store.setMeta(pendingKey(userId), JSON.stringify([...ids, id])).catch(() => undefined);
}

/** Sends the reads that were made offline. A message that is gone (404) is dropped; a network failure keeps the rest. */
export async function flushPendingReads(userId: string) {
  const ids = await loadPending(userId);
  if (ids.length === 0) return;
  const left: string[] = [];
  for (const id of ids) {
    try {
      await markInboxRead(id);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) left.push(id);
    }
  }
  await store.setMeta(pendingKey(userId), JSON.stringify(left)).catch(() => undefined);
}

/** The badge count: read when the app comes to the front, after a connection returns, and on `refresh()` (no push yet). */
export function useUnreadCount() {
  const online = useOnline();
  const userId = useSessionUser()?.id ?? null;
  const [count, setCount] = useState(0);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    if (!online || !userId) return;
    let alive = true;
    (async () => {
      await flushPendingReads(userId);
      const unread = await getUnreadCount().catch(() => null);
      if (alive && unread !== null) setCount(unread);
    })();
    return () => {
      alive = false;
    };
  }, [online, userId, tick]);

  return { count, refresh };
}

export const badgeText = (count: number) => (count <= 0 ? null : count > 99 ? '99+' : String(count));
