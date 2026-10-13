import { notifyOutboxChanged, createRecord, listRecords, queueRecord } from './outbox';
import { pushPending, refreshNow, type PushSummary } from './engine';
import { store } from './store';
import type { OutboxRecord, SyncKind } from './types';

/** The record kinds that make up a day's report. The DCR_SUBMIT depends on every one of them. */
export const DAY_KINDS: SyncKind[] = ['DOCTOR_CALL', 'CHEMIST_CALL', 'DOCTOR_FOLLOWUP', 'CHEMIST_FOLLOWUP', 'EXPENSE'];

const reportDateOf = (r: OutboxRecord) => (r.payload as { reportDate?: string } | null)?.reportDate;

/** Everything of one day's report that isn't on the server yet. */
export async function unsentForDay(reportDate: string): Promise<OutboxRecord[]> {
  const all = await listRecords();
  return all.filter((r) => !r.deleted && DAY_KINDS.includes(r.kind) && reportDateOf(r) === reportDate && r.status !== 'SYNCED');
}

/**
 * Sends records that stand on their own (an order, a stock count, a service, a gift marked done): their
 * drafts are queued and pushed at once, never touching the day's report. Offline, they stay on the phone.
 */
export async function sendNow(kinds: SyncKind[]): Promise<PushSummary> {
  for (const kind of kinds) for (const r of await listRecords({ kind, status: 'DRAFT' })) if (!r.deleted) await queueRecord(r.clientId);
  return pushPending(kinds);
}

export type FinalSubmitResult = PushSummary & {
  /** The day's own submit, as the server answered it. */
  submit: OutboxRecord | null;
};

/**
 * Final Submission (HLD 01 §1.2, LLD sync.md): puts the day's drafts into the report, adds the
 * `DCR_SUBMIT` that depends on all of them, and sends the lot in order. A record the server refuses
 * stays on the phone, marked, and holds the submit back; the MR fixes it and submits again.
 * Needs a connection — the caller disables the button offline.
 */
/**
 * Sends the doctors the MR added (not tied to any day): their drafts are queued and pushed on their own,
 * so it works any time there is a connection and never touches the day's report.
 */
export async function sendNewDoctors(): Promise<PushSummary> {
  for (const r of await listRecords({ kind: 'NEW_DOCTOR', status: 'DRAFT' })) if (!r.deleted) await queueRecord(r.clientId);
  return pushPending(['NEW_DOCTOR']);
}

/**
 * `remarks` is the employee's note on the day (`DCR_SUBMIT` payload): required on a Meeting or Conference day — the server
 * refuses without it (`REMARKS_REQUIRED`) — and optional otherwise.
 */
export async function finalSubmit(reportDate: string, remarks: string | null = null): Promise<FinalSubmitResult> {
  await sendNewDoctors().catch(() => undefined); // a failed new doctor is shown on its own screen; it must not stop the day
  const unsent = await unsentForDay(reportDate);
  for (const r of unsent) if (r.status === 'DRAFT') await queueRecord(r.clientId);

  const dependsOn = unsent.map((r) => r.clientId);
  const all = await listRecords({ kind: 'DCR_SUBMIT' });
  const existing = all.find((r) => !r.deleted && reportDateOf(r) === reportDate && r.status !== 'SYNCED') ?? null;

  let submitId: string;
  if (existing) {
    submitId = existing.clientId;
    // Left from an earlier try (offline, or a record failed): same submit, with today's dependency list.
    await store.upsertRecord({
      ...existing,
      payload: { reportDate, remarks },
      status: 'QUEUED',
      dependsOn,
      errorCode: null,
      errorMessage: null,
      clientUpdatedAt: new Date().toISOString(),
      dirty: true,
    });
    notifyOutboxChanged();
  } else {
    submitId = (await createRecord('DCR_SUBMIT', { reportDate, remarks }, { dependsOn, status: 'QUEUED' })).clientId;
  }

  const summary = await pushPending();
  await refreshNow(); // the report's new status for the Summary and Home
  // This try's own submit, not an older one of the same day (a rejected report has been submitted before).
  const after = (await listRecords({ kind: 'DCR_SUBMIT' })).find((r) => r.clientId === submitId) ?? null;
  return { ...summary, submit: after };
}
