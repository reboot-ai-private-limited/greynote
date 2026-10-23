import { ApiError, apiGet, apiPost, apiPut, NetworkError } from '@/lib/api';

import { notifyCacheChanged } from './cache';
import { refreshColleagues } from './colleagues';
import { isOnline } from './connectivity';
import { uploadPendingPhotos } from './doctor-photos';
import { notifyOutboxChanged, queueRecord } from './outbox';
import { orderForPush } from './order';
import { getNumberSetting } from './settings';
import { store } from './store';
import type { OutboxRecord, SyncKind } from './types';

/**
 * Talks to the server's sync endpoints (LLD/sync.md):
 *   pull    GET  /sync/pull     reference data → local cache (versioned snapshots)
 *   push    POST /sync/push     the day's records → server, at Submit only
 *   backup  PUT  /sync/drafts   unsent records → a private holding area, whenever online
 *   restore GET  /sync/drafts   bring the holding area back on a new or wiped phone
 *
 * Nothing here runs a business rule: the server's handlers do, at push. The phone only orders,
 * chunks, retries and records the answers.
 */

/* ───────────────────────────── status (for the UI) ───────────────────────────── */

export type SyncStatus = {
  syncing: boolean;
  lastPullAt: string | null;
  lastBackupAt: string | null;
  lastError: string | null;
};

let status: SyncStatus = { syncing: false, lastPullAt: null, lastBackupAt: null, lastError: null };
const statusListeners = new Set<() => void>();
const setStatus = (patch: Partial<SyncStatus>) => {
  status = { ...status, ...patch };
  statusListeners.forEach((l) => l());
};
export const getSyncStatus = () => status;
export function subscribeSyncStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

const message = (err: unknown) =>
  err instanceof NetworkError || err instanceof ApiError
    ? err.message
    : 'Something went wrong while syncing.';

/* ───────────────────────────────────── pull ───────────────────────────────────── */

type PullResponse = {
  serverTime: string;
  sources: Record<
    string,
    { version: string; unchanged: true } | { version: string; data: unknown } | { error: { code: string; message: string } }
  >;
};

export type PullResult = { updated: string[]; unchanged: string[]; failed: string[] };

/** Refreshes the cached reference data. A source that fails keeps its previous snapshot. */
export async function pull(): Promise<PullResult> {
  const versions = await store.listCacheVersions();
  const query = Object.entries(versions)
    .map(([source, version]) => `v%5B${encodeURIComponent(source)}%5D=${version}`)
    .join('&');
  const response = await apiGet<PullResponse>(`/sync/pull${query ? `?${query}` : ''}`);

  const now = new Date().toISOString();
  const result: PullResult = { updated: [], unchanged: [], failed: [] };
  for (const [source, entry] of Object.entries(response.sources)) {
    if ('error' in entry) {
      result.failed.push(source);
    } else if ('unchanged' in entry) {
      const held = await store.getCache(source);
      if (held) await store.setCache(source, { ...held, fetchedAt: now });
      result.unchanged.push(source);
    } else {
      await store.setCache(source, { version: entry.version, data: entry.data, fetchedAt: now });
      result.updated.push(source);
    }
  }
  // How far the phone's clock is from the server's (ms, + = phone ahead). Cutoffs use the phone's
  // clock for offline records, so the app can warn when it is far out.
  await store.setMeta('clockOffsetMs', String(Date.now() - new Date(response.serverTime).getTime()));
  await store.setMeta('lastPullAt', now);
  setStatus({ lastPullAt: now });
  notifyCacheChanged();
  return result;
}

export async function getClockOffsetMs(): Promise<number> {
  return Number((await store.getMeta('clockOffsetMs')) ?? 0);
}

/* ───────────────────────────────────── push ───────────────────────────────────── */

type PushResult = {
  clientId: string;
  status: 'SYNCED' | 'ALREADY_SYNCED' | 'FAILED';
  serverId?: string;
  data?: unknown;
  reason?: { code: string; message: string };
};

export type PushSummary = {
  sent: number;
  synced: number;
  failed: number;
  /** Not sent because a record they depend on failed. They stay editable and are retried. */
  held: number;
  /** The connection dropped (or there was none): what wasn't answered stays queued. */
  offline: boolean;
  error: string | null;
};

/**
 * The daily report's Submit: sends everything QUEUED or FAILED, parents first, in chunks of at
 * most SYNC_MAX_BATCH, and takes the server's answer as the truth for each record (G10). Safe to
 * run again: every record is idempotent on its clientId. Needs a live connection — the caller
 * disables Submit offline (HLD 01 §1.2).
 */
export async function pushPending(only?: SyncKind[], opts: { skipFailed?: boolean } = {}): Promise<PushSummary> {
  const summary: PushSummary = { sent: 0, synced: 0, failed: 0, held: 0, offline: false, error: null };
  const queued = await store.listRecords({ status: opts.skipFailed ? ['QUEUED'] : ['QUEUED', 'FAILED'] });
  // `only` narrows a push to some kinds (e.g. a new doctor), so it never drags the day's report along with it.
  const pending = orderForPush(only ? queued.filter((r) => only.includes(r.kind)) : queued);
  if (pending.length === 0) {
    await uploadPhotosQuietly(); // a photo whose doctor synced earlier may still be waiting
    return summary;
  }

  const maxBatch = await getNumberSetting('SYNC_MAX_BATCH');
  const failedIds = new Set<string>();
  setStatus({ syncing: true, lastError: null });

  try {
    for (let i = 0; i < pending.length; i += maxBatch) {
      // A child whose parent failed (this run) is held back: the server only knows what synced.
      const chunk: OutboxRecord[] = [];
      for (const r of pending.slice(i, i + maxBatch)) {
        if (r.dependsOn.some((d) => failedIds.has(d))) {
          failedIds.add(r.clientId);
          summary.held += 1;
          await store.upsertRecord({
            ...r,
            status: 'FAILED',
            errorCode: 'DEPENDENCY_FAILED',
            errorMessage: 'Another record this one depends on failed. Fix that one first.',
          });
        } else {
          chunk.push(r);
        }
      }
      if (chunk.length === 0) continue;

      let response: { results: PushResult[] };
      try {
        response = await apiPost<{ results: PushResult[] }>(
          '/sync/push',
          {
            records: chunk.map((r) => ({
              clientId: r.clientId,
              kind: r.kind,
              dependsOn: r.dependsOn,
              clientCreatedAt: r.clientCreatedAt,
              payload: r.payload,
            })),
          },
          { auth: true },
        );
      } catch (err) {
        if (err instanceof NetworkError) summary.offline = true;
        summary.error = message(err);
        break; // everything not answered stays QUEUED/FAILED, to be sent again
      }

      const byId = new Map(response.results.map((r) => [r.clientId, r]));
      for (const record of chunk) {
        const result = byId.get(record.clientId);
        summary.sent += 1;
        if (result && (result.status === 'SYNCED' || result.status === 'ALREADY_SYNCED')) {
          summary.synced += 1;
          await store.upsertRecord({
            ...record,
            status: 'SYNCED',
            serverId: result.serverId ?? record.serverId,
            serverData: result.data ?? null,
            errorCode: null,
            errorMessage: null,
            attempts: record.attempts + 1,
            dirty: false, // the server deletes its draft copy in the same transaction
          });
        } else {
          summary.failed += 1;
          failedIds.add(record.clientId);
          await store.upsertRecord({
            ...record,
            status: 'FAILED',
            errorCode: result?.reason?.code ?? 'NO_RESULT',
            errorMessage: result?.reason?.message ?? 'The server gave no answer for this record.',
            attempts: record.attempts + 1,
          });
        }
      }
    }
  } finally {
    setStatus({ syncing: false, lastError: summary.error });
    notifyOutboxChanged();
  }
  if (!summary.offline) await uploadPhotosQuietly();
  return summary;
}

/** Uploads the photos of doctors added on the phone once those doctors have synced (offline/doctor-photos.ts). Never throws. */
async function uploadPhotosQuietly(): Promise<void> {
  if (!isOnline()) return;
  try {
    if ((await uploadPendingPhotos()) > 0) notifyOutboxChanged();
  } catch {
    // A photo never holds up a sync; it is tried again next time.
  }
}

/**
 * Forgets records the server has had for longer than the server would accept a resend of. Doctor calls and follow-ups stay
 * at least as long as the days between visits, so the phone can still grey out a doctor visited too recently (dcr.md rule 11).
 */
export async function pruneSynced(): Promise<void> {
  const [keepDays, gapDays] = await Promise.all([getNumberSetting('SYNC_MAX_AGE_DAYS'), getNumberSetting('DOCTOR_VISIT_GAP_DAYS')]);
  const day = 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - keepDays * day;
  const visitCutoff = Date.now() - Math.max(keepDays, gapDays + 1) * day;
  const old = (await store.listRecords({ status: 'SYNCED' })).filter(
    (r) => new Date(r.clientUpdatedAt).getTime() < (r.kind === 'DOCTOR_CALL' || r.kind === 'DOCTOR_FOLLOWUP' ? visitCutoff : cutoff),
  );
  await store.purgeRecords(old.map((r) => r.clientId));
}

/* ──────────────────────────────── draft backup ──────────────────────────────── */

/** What is stored as a draft's opaque `payload`: enough to rebuild the local record on another phone. */
type DraftEnvelope = {
  v: 1;
  status: 'DRAFT' | 'QUEUED' | 'FAILED';
  dependsOn: string[];
  clientCreatedAt: string;
  payload: unknown;
};

type DraftResult = { clientId: string; status: 'STORED' | 'STALE' | 'SUBMITTED' | 'REJECTED'; reason?: { code: string; message: string } };

/**
 * Backs the unsent records up to the server's private holding area. It counts for nothing there —
 * the commit is Submit alone. A removal is sent as a tombstone, then forgotten locally.
 */
export async function backupDrafts(): Promise<{ stored: number; rejected: number }> {
  const [live, tombstones] = await Promise.all([store.listRecords(), store.listTombstones()]);
  const dirty = live.filter((r) => r.dirty && r.status !== 'SYNCED');
  const removed = tombstones.filter((r) => r.status !== 'SYNCED');
  const maxBatch = await getNumberSetting('SYNC_MAX_BATCH');
  const maxBytes = await getNumberSetting('SYNC_MAX_DRAFT_BYTES');

  const items = [
    ...dirty.map((r) => ({
      record: r,
      body: {
        clientId: r.clientId,
        kind: r.kind,
        clientUpdatedAt: r.clientUpdatedAt,
        payload: {
          v: 1,
          status: r.status as DraftEnvelope['status'], // SYNCED records are never backed up
          dependsOn: r.dependsOn,
          clientCreatedAt: r.clientCreatedAt,
          payload: r.payload,
        } satisfies DraftEnvelope,
      },
    })),
    ...removed.map((r) => ({
      record: r,
      body: { clientId: r.clientId, clientUpdatedAt: r.clientUpdatedAt, deleted: true as const },
    })),
  ];

  let stored = 0;
  let rejected = 0;
  for (let i = 0; i < items.length; i += maxBatch) {
    const chunk = items.slice(i, i + maxBatch).filter(
      // Too big to ever be accepted: skip it rather than resend it on every sync.
      (item) => !('payload' in item.body) || JSON.stringify(item.body.payload).length <= maxBytes,
    );
    if (chunk.length === 0) continue;

    const response = await apiPut<{ results: DraftResult[] }>('/sync/drafts', {
      drafts: chunk.map((c) => c.body),
    });
    const byId = new Map(response.results.map((r) => [r.clientId, r]));
    const purge: string[] = [];
    for (const { record } of chunk) {
      const result = byId.get(record.clientId);
      if (!result || result.status === 'REJECTED') {
        rejected += 1;
        continue; // stays dirty; the server's reason is logged by the next backup attempt
      }
      stored += 1;
      if (record.deleted) purge.push(record.clientId);
      else await store.upsertRecord({ ...record, dirty: false });
    }
    await store.purgeRecords(purge);
  }
  if (items.length > 0) {
    const now = new Date().toISOString();
    await store.setMeta('lastBackupAt', now);
    setStatus({ lastBackupAt: now });
  }
  return { stored, rejected };
}

/** Brings the server's drafts back — a new phone, or one that was wiped. Local, newer copies win. */
export async function restoreDrafts(): Promise<number> {
  let restored = 0;
  let after: string | null = null;
  do {
    const page: {
      drafts: { clientId: string; kind: SyncKind; clientUpdatedAt: string; payload: DraftEnvelope }[];
      nextCursor: string | null;
    } = await apiGet(`/sync/drafts?limit=200${after ? `&after=${after}` : ''}`);
    for (const d of page.drafts) {
      const local = await store.getRecord(d.clientId);
      if (local && local.clientUpdatedAt >= d.clientUpdatedAt) continue;
      if (local?.status === 'SYNCED') continue;
      const env = d.payload;
      await store.upsertRecord({
        clientId: d.clientId,
        kind: d.kind,
        payload: env?.payload ?? null,
        dependsOn: env?.dependsOn ?? [],
        status: env?.status ?? 'DRAFT',
        clientCreatedAt: env?.clientCreatedAt ?? d.clientUpdatedAt,
        clientUpdatedAt: d.clientUpdatedAt,
        serverId: null,
        serverData: null,
        errorCode: null,
        errorMessage: null,
        attempts: 0,
        deleted: false,
        dirty: false,
      });
      restored += 1;
    }
    after = page.nextCursor;
  } while (after);
  if (restored > 0) notifyOutboxChanged();
  return restored;
}

/* ────────────────────────────────── orchestration ────────────────────────────────── */

/**
 * First thing after a login: if a different employee last used this phone, wipe their data, and
 * if this phone has nothing yet, restore this employee's backed-up drafts.
 */
export async function prepareForUser(userId: string): Promise<void> {
  const previous = await store.getMeta('userId');
  if (previous && previous !== userId) await store.clearAll();
  await store.setMeta('userId', userId);
  if ((await store.listRecords()).length === 0 && isOnline()) {
    try {
      await restoreDrafts();
    } catch {
      // Not fatal: the regular sync tries to back up, and the MR can still work.
    }
  }
}

/** Records that stand on their own, not part of a day's report: sent as soon as there is a connection. */
export const STANDALONE_KINDS: SyncKind[] = ['ORDER', 'MONTHLY_STOCK', 'DOCTOR_SERVICE', 'GIFT_DONE', 'NEW_DOCTOR'];

/** Sends what was saved offline. A record the server refused is left for its owner to fix, not retried here. */
async function sendStandalone(): Promise<void> {
  for (const r of await store.listRecords({ status: 'DRAFT' })) {
    if (!r.deleted && STANDALONE_KINDS.includes(r.kind)) await queueRecord(r.clientId);
  }
  await pushPending(STANDALONE_KINDS, { skipFailed: true });
}

let running: Promise<void> | null = null;

/**
 * The background sync: refresh reference data, then back the unsent records up. One at a time.
 * Never submits — that is the MR tapping Submit. Safe to call from anywhere, any time.
 */
export function runSync(): Promise<void> {
  if (!isOnline()) return Promise.resolve();
  running ??= (async () => {
    setStatus({ syncing: true, lastError: null });
    try {
      await sendStandalone().catch(() => undefined); // what was saved offline goes first, so the pull below sees it
      await pull();
      await refreshColleagues();
      await backupDrafts();
      await pruneSynced();
      setStatus({ lastError: null });
    } catch (err) {
      setStatus({ lastError: message(err) });
    } finally {
      setStatus({ syncing: false });
      notifyOutboxChanged();
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * A pull right now. Unlike runSync it never joins a background sync already in flight — that one may
 * have started before the change the caller just made, and would hand back the old state.
 */
export async function refreshNow(): Promise<void> {
  if (!isOnline()) return;
  try {
    await pull();
  } catch (err) {
    setStatus({ lastError: message(err) });
  }
}

export async function resetOfflineData(): Promise<void> {
  await store.clearAll();
  status = { syncing: false, lastPullAt: null, lastBackupAt: null, lastError: null };
  statusListeners.forEach((l) => l());
  notifyOutboxChanged();
}
