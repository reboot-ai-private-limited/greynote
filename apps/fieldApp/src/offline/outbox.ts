import * as Crypto from 'expo-crypto';

import { store } from './store';
import type { OutboxRecord, OutboxStatus, SyncKind } from './types';

/**
 * The day's records on this phone. Screens create and edit records here (never calling the
 * server for them); the sync engine sends them at Submit. See hld/01 §1.2.
 *
 *   DRAFT ──queue──► QUEUED ──push──► SYNCED
 *     ▲                 │
 *     └──── edit ◄── FAILED ◄─────────┘   (a failed record stays editable)
 */

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Called after any change, so hooks (counts, lists) can refresh. */
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export { notify as notifyOutboxChanged };

const nowIso = () => new Date().toISOString();

export async function createRecord(
  kind: SyncKind,
  payload: unknown,
  opts: { dependsOn?: string[]; clientCreatedAt?: string; status?: 'DRAFT' | 'QUEUED' } = {},
): Promise<OutboxRecord> {
  const now = nowIso();
  const record: OutboxRecord = {
    clientId: Crypto.randomUUID(),
    kind,
    payload,
    dependsOn: opts.dependsOn ?? [],
    status: opts.status ?? 'DRAFT',
    clientCreatedAt: opts.clientCreatedAt ?? now,
    clientUpdatedAt: now,
    serverId: null,
    serverData: null,
    errorCode: null,
    errorMessage: null,
    attempts: 0,
    deleted: false,
    dirty: true,
  };
  await store.upsertRecord(record);
  notify();
  return record;
}

/** Edit a record that hasn't reached the server. A failed one goes back in the day's report. */
export async function updateRecord(
  clientId: string,
  payload: unknown,
  dependsOn?: string[],
): Promise<OutboxRecord> {
  const record = await store.getRecord(clientId);
  if (!record || record.deleted) throw new Error('That record no longer exists.');
  if (record.status === 'SYNCED' || record.status === 'QUEUED') {
    throw new Error('A submitted record can’t be edited.');
  }
  const next: OutboxRecord = {
    ...record,
    payload,
    dependsOn: dependsOn ?? record.dependsOn,
    status: record.status === 'FAILED' ? 'QUEUED' : 'DRAFT',
    errorCode: null,
    errorMessage: null,
    clientUpdatedAt: nowIso(),
    dirty: true,
  };
  await store.upsertRecord(next);
  notify();
  return next;
}

/** DRAFT → QUEUED: the record is now part of the day's report, waiting for Submit. */
export async function queueRecord(clientId: string): Promise<void> {
  const record = await store.getRecord(clientId);
  if (!record || record.deleted) return;
  if (record.status !== 'DRAFT') return;
  await store.upsertRecord({ ...record, status: 'QUEUED', clientUpdatedAt: nowIso(), dirty: true });
  notify();
}

/** Remove a record that hasn't reached the server. Kept as a tombstone until the backup knows. */
export async function removeRecord(clientId: string): Promise<void> {
  const record = await store.getRecord(clientId);
  if (!record) return;
  if (record.status === 'SYNCED' || record.status === 'QUEUED') {
    throw new Error('A submitted record can’t be removed.');
  }
  await store.upsertRecord({ ...record, deleted: true, clientUpdatedAt: nowIso(), dirty: true });
  notify();
}

/** Forget a record the server has already deleted (a call or follow-up removed from the day's report). */
export async function forgetSyncedRecord(clientId: string): Promise<void> {
  const record = await store.getRecord(clientId);
  if (!record) return;
  await store.upsertRecord({ ...record, deleted: true, clientUpdatedAt: nowIso(), dirty: true });
  notify();
}

export const getRecord = (clientId: string) => store.getRecord(clientId);

export const listRecords = (filter?: { status?: OutboxStatus | OutboxStatus[]; kind?: SyncKind }) =>
  store.listRecords(filter);

export async function countByStatus(): Promise<Record<OutboxStatus, number>> {
  const counts: Record<OutboxStatus, number> = { DRAFT: 0, QUEUED: 0, SYNCED: 0, FAILED: 0 };
  for (const r of await store.listRecords()) counts[r.status] += 1;
  return counts;
}

/** Unsent = anything the server doesn't have yet. Logout warns when this isn't zero. */
export async function countUnsent(): Promise<number> {
  const c = await countByStatus();
  return c.DRAFT + c.QUEUED + c.FAILED;
}
