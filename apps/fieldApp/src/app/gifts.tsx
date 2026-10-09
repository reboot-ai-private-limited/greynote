import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatRupees } from '@/lib/money';
import { createRecord, refreshNow, removeRecord, sendNow, useOnline, useRecords, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import type { FieldActivitySnapshot, FieldMasterDataSnapshot } from '@/types/sync';

type Msg = { tone: 'danger' | 'success' | 'info'; text: string };

/**
 * Doctor Gifts (PRD §6.2): gifts Admin set aside for your doctors. Your only action is to mark one done
 * once you've handed it over. Marking works offline — it is sent when the phone is back online.
 */
export default function GiftsScreen() {
  const online = useOnline();
  const activity = useCachedSource<FieldActivitySnapshot>('fieldActivity');
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { records } = useRecords(['GIFT_DONE']);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);

  const doctorName = (id: string) => master.data?.doctors.find((d) => d.id === id)?.name ?? 'Doctor';
  const pending = activity.data?.pendingGifts ?? [];
  // The newest record for each gift that the server doesn't have yet (a SYNCED one is already out of the pending list).
  const local = new Map<string, OutboxRecord>();
  for (const r of records) if (!r.deleted && r.status !== 'SYNCED') local.set((r.payload as { giftId: string }).giftId, r);

  const markDone = async (giftId: string) => {
    setBusy(giftId);
    setMsg(null);
    try {
      await createRecord('GIFT_DONE', { giftId });
      if (online) {
        const result = await sendNow(['GIFT_DONE']);
        if (result.failed === 0) await refreshNow();
      } else {
        setMsg({ tone: 'info', text: 'Marked done on this phone. It will be sent when you’re online.' });
      }
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not mark it done.' });
    } finally {
      setBusy(null);
    }
  };

  const retry = async () => {
    setBusy('retry');
    try {
      await sendNow(['GIFT_DONE']);
      await refreshNow();
    } finally {
      setBusy(null);
    }
  };

  const undo = async (r: OutboxRecord) => {
    try {
      await removeRecord(r.clientId);
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not undo it.' });
    }
  };

  return (
    <ScreenShell title="Doctor Gifts">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {!online ? <Notice tone="info">You’re offline. Marking a gift done is kept on the phone and sent later.</Notice> : null}

      {!activity.loaded ? (
        <Notice tone="info">Loading…</Notice>
      ) : pending.length === 0 ? (
        <Notice tone="info">No gifts waiting to be given. Admin allocates gifts to your doctors from the web portal.</Notice>
      ) : (
        pending.map((g) => {
          const rec = local.get(g.id);
          return (
            <ThemedView key={g.id} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{g.productName}</ThemedText>
              <ThemedText type="small">{`For ${doctorName(g.doctorId)} · ${formatRupees(g.amountPaise)}`}</ThemedText>
              {rec?.status === 'FAILED' ? (
                <>
                  <ThemedText type="small" themeColor="danger">
                    {rec.errorMessage ?? 'The server did not accept this.'}
                  </ThemedText>
                  <View style={styles.row}>
                    <PrimaryButton label="Try again" variant="text" loading={busy === 'retry'} onPress={retry} />
                    <PrimaryButton label="Undo" variant="text" onPress={() => undo(rec)} />
                  </View>
                </>
              ) : rec ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    Marked done · waiting to be sent
                  </ThemedText>
                  {rec.status === 'DRAFT' ? <PrimaryButton label="Undo" variant="text" onPress={() => undo(rec)} /> : null}
                </>
              ) : (
                <PrimaryButton label="Mark done" loading={busy === g.id} disabled={busy !== null} onPress={() => markDone(g.id)} />
              )}
            </ThemedView>
          );
        })
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
});
