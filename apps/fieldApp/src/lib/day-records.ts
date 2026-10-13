import { Alert } from 'react-native';

import { forgetSyncedRecord, refreshNow, removeRecord, type OutboxRecord } from '@/offline';
import { store } from '@/offline/store';
import type { FieldActivitySnapshot } from '@/types/sync';

import { apiDelete } from './api';

/** Calls and follow-ups have their own DELETE paths on the day's report (docs/mobile/dcr.md rule 8). */
const isFollowup = (r: OutboxRecord) => r.kind === 'DOCTOR_FOLLOWUP' || r.kind === 'CHEMIST_FOLLOWUP';

/** The id of the server's daily report for a date, from the last `fieldActivity` pull. */
async function dcrIdFor(reportDate: string): Promise<string | null> {
  const cached = await store.getCache('fieldActivity');
  const dcrs = (cached?.data as FieldActivitySnapshot | undefined)?.dcrs ?? [];
  return dcrs.find((d) => d.reportDate === reportDate)?.id ?? null;
}

/**
 * Removes a call or follow-up before the final submit. One that never left the phone is just deleted here. One the server has
 * (sent with an earlier submit that was then sent back) is deleted there first — online only; a doctor call gives its samples
 * back. The server refuses (409) while the report is with the manager.
 */
export async function removeDayRecord(record: OutboxRecord): Promise<void> {
  if (record.status !== 'SYNCED') {
    await removeRecord(record.clientId);
    return;
  }
  const reportDate = (record.payload as { reportDate?: string }).reportDate ?? '';
  const dcrId = await dcrIdFor(reportDate);
  if (!dcrId || !record.serverId) throw new Error('This record isn’t on today’s report on the server. Pull to refresh and try again.');
  await apiDelete<null>(`/field-activity/dcr/${dcrId}/${isFollowup(record) ? 'followups' : 'calls'}/${record.serverId}`);
  await forgetSyncedRecord(record.clientId);
  await refreshNow().catch(() => undefined);
}

/** The soft confirmation the docs ask for before a removal; `onRemove` runs only on Yes. */
export function confirmRemove(what: 'call' | 'follow-up', onRemove: () => void) {
  Alert.alert(`Remove this ${what}?`, 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onRemove },
  ]);
}
