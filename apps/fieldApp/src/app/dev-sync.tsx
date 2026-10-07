import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  createRecord,
  listRecords,
  backupDrafts,
  notifyOutboxChanged,
  pushPending,
  queueRecord,
  runSync,
  subscribeOutbox,
  useOnline,
  type OutboxRecord,
} from '@/offline';
import { store } from '@/offline/store';

/**
 * DEV ONLY — a throwaway harness for exercising the offline layer before any real screen creates
 * records (Stage 1 test). Reachable at /dev-sync in dev builds; delete once Stages 3–4 land.
 */
type Row = { id?: string; _id?: string };
const idOf = (r: Row | undefined) => r?.id ?? r?._id;

export default function DevSyncScreen() {
  const online = useOnline();
  const [records, setRecords] = useState<OutboxRecord[]>([]);
  const [cacheInfo, setCacheInfo] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setRecords(await listRecords());
    const lines: string[] = [];
    for (const source of ['config', 'fieldMasterData', 'territory', 'hr', 'fieldActivity', 'planning']) {
      const c = await store.getCache(source);
      if (!c) {
        lines.push(`${source}: (none)`);
        continue;
      }
      const d = c.data as Record<string, unknown>;
      const counts = Object.entries(d ?? {})
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => `${k}=${(v as unknown[]).length}`)
        .join(' ');
      lines.push(`${source}: v${c.version.slice(0, 7)} ${counts}`);
    }
    setCacheInfo(lines);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeOutbox(() => void refresh());
  }, [refresh]);

  const add = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 12));
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      add(`${label}: ${JSON.stringify(await fn())}`);
    } catch (err) {
      add(`${label} threw: ${String(err)}`);
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  async function queueExpense() {
    const r = await createRecord('EXPENSE', { reportDate: today, type: 'MISC', amountPaise: 5000, remarks: 'dev sync test' });
    await queueRecord(r.clientId);
    return { queued: r.clientId.slice(0, 8) };
  }

  async function wipeTestRecords() {
    const now = new Date().toISOString();
    const all = await listRecords();
    for (const r of all) await store.upsertRecord({ ...r, deleted: true, dirty: true, clientUpdatedAt: now });
    notifyOutboxChanged();
    return { removed: all.length, backup: await backupDrafts() };
  }

  async function queueOrder() {
    const fmd = (await store.getCache('fieldMasterData'))?.data as
      | { chemists?: Row[]; products?: (Row & { name?: string })[] }
      | undefined;
    const chemist = idOf(fmd?.chemists?.[0]);
    const product = idOf(fmd?.products?.[0]);
    if (!chemist || !product) return { skipped: 'no chemist or product in the cache' };
    const r = await createRecord('ORDER', {
      outletType: 'CHEMIST',
      outletId: chemist,
      remarks: 'dev sync test',
      lines: [{ productId: product, quantity: 1, unitPricePaise: 10000 }],
    });
    await queueRecord(r.clientId);
    return { queued: r.clientId.slice(0, 8), chemist: chemist.slice(-6), product: product.slice(-6) };
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Dev sync test</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {online ? 'Online' : 'Offline'} · {records.length} record(s)
          </ThemedText>

          <PrimaryButton label="Run sync (pull + backup)" disabled={busy} onPress={() => run('sync', async () => { await runSync(); return 'done'; })} />
          <PrimaryButton label="Queue EXPENSE (expect FAILED: plan not approved)" disabled={busy} onPress={() => run('expense', queueExpense)} />
          <PrimaryButton label="Queue ORDER for first chemist (expect SYNCED)" disabled={busy} onPress={() => run('order', queueOrder)} />
          <PrimaryButton label="Remove all test records (local + server drafts)" disabled={busy} onPress={() => run('wipe', wipeTestRecords)} />
          <PrimaryButton label="Push now" disabled={busy} onPress={() => run('push', pushPending)} />

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Cache</ThemedText>
            {cacheInfo.map((l) => (
              <ThemedText key={l} type="small">
                {l}
              </ThemedText>
            ))}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Outbox</ThemedText>
            {records.length === 0 ? <ThemedText type="small">empty</ThemedText> : null}
            {records.map((r) => (
              <ThemedText key={r.clientId} type="small">
                {r.kind} {r.clientId.slice(0, 8)} {r.status}
                {r.serverId ? ` → ${r.serverId.slice(-6)}` : ''}
                {r.errorCode ? ` [${r.errorCode}: ${r.errorMessage}]` : ''}
              </ThemedText>
            ))}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Log</ThemedText>
            {log.map((l, i) => (
              <ThemedText key={i} type="small">
                {l}
              </ThemedText>
            ))}
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
});
