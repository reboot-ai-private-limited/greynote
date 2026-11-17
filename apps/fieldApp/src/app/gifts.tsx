import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { NumberedRow } from '@/components/numbered-row';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, Pill, SummaryStrip } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useDebounced } from '@/hooks/use-debounced';
import { useWindowed } from '@/hooks/use-windowed';
import { listGifts, type GiftView } from '@/lib/gifts';
import { formatRupees } from '@/lib/money';
import { useSessionUser } from '@/lib/session';
import { createRecord, refreshNow, removeRecord, sendNow, useOnline, useRecords, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyDay } from '@/offline/day';
import type { FieldActivitySnapshot, FieldMasterDataSnapshot } from '@/types/sync';

type Msg = { tone: 'danger' | 'success' | 'info'; text: string };
type Filter = 'ALL' | 'PENDING' | 'DONE';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Not done' },
  { value: 'DONE', label: 'Done' },
];

/**
 * Doctor Gifts (PRD §6.2): every gift Admin set aside for your doctors, done or not, newest first, with one filter row (All, Not done, Done).
 * A manager sees the gifts of their whole team's doctors too, each marked with the MR (yours "(Own)"). Your only action is to mark one of your
 * own done once handed over; that works offline and is sent when the phone is back online. The last list read is kept for offline.
 */
export default function GiftsScreen() {
  const online = useOnline();
  const me = useSessionUser();
  const { isManager } = useCurrentUser();
  const activity = useCachedSource<FieldActivitySnapshot>('fieldActivity');
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { records } = useRecords(['GIFT_DONE']);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim().toLowerCase(), 300);

  const server = useCachedFetch<GiftView[]>(`gifts:${isManager ? 'team' : 'mine'}`, () => listGifts(isManager), records.filter((r) => r.status === 'SYNCED').length);
  const doctorName = (id: string) => master.data?.doctors.find((d) => d.id === id)?.name ?? 'Doctor';
  // Offline and never loaded: the phone's own copy of the gifts still to give stands in.
  const fromPhone: GiftView[] = (activity.data?.pendingGifts ?? []).map((g) => ({ ...g, doctorName: doctorName(g.doctorId), status: 'PENDING', allocatedAt: '', completedAt: null }));
  const list = server.data ?? fromPhone;

  // The newest record for each gift that the server doesn't have yet (a SYNCED one is already out of the pending list).
  const local = new Map<string, OutboxRecord>();
  for (const r of records) if (!r.deleted && r.status !== 'SYNCED') local.set((r.payload as { giftId: string }).giftId, r);

  const own = (g: GiftView) => !g.userId || !me || g.userId === me.id;
  const done = (g: GiftView) => g.status === 'DONE';
  const rows = list
    .filter((g) => (filter === 'ALL' || (filter === 'DONE') === done(g)) && (!term || `${g.doctorName} ${g.productName} ${g.userName ?? ''}`.toLowerCase().includes(term)))
    .sort((a, b) => b.allocatedAt.localeCompare(a.allocatedAt) || b.id.localeCompare(a.id));
  const { visible } = useWindowed(rows, `${filter}|${term}`);
  const notDone = list.filter((g) => !done(g)).length;

  const markDone = async (giftId: string) => {
    setBusy(giftId);
    setMsg(null);
    try {
      await createRecord('GIFT_DONE', { giftId });
      if (online) {
        const result = await sendNow(['GIFT_DONE']);
        if (result.failed === 0) await refreshNow();
        server.reload();
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
      server.reload();
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
    <ScreenShell title="Doctor Gifts" subtitle={isManager ? 'Gifts for your doctors and your team’s' : 'Gifts for your doctors'} onRefresh={server.reload} refreshing={server.refreshing}>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {!online ? <Notice tone="info">You’re offline. Marking a gift done is kept on the phone and sent later.</Notice> : null}
      {server.error && online ? <Notice tone="danger">{server.error}</Notice> : null}

      <SummaryStrip
        items={[
          { label: 'Gifts', value: String(list.length).padStart(2, '0'), accent: 'blue' },
          { label: 'Not done', value: String(notDone).padStart(2, '0'), accent: notDone > 0 ? 'amber' : 'slate' },
          { label: 'Done', value: String(list.length - notDone).padStart(2, '0'), accent: 'green' },
        ]}
      />
      <ChoiceChips options={FILTERS} value={filter} onChange={setFilter} />
      <TextField label={isManager ? 'Search a doctor, a gift or an MR' : 'Search a doctor or a gift'} value={search} onChangeText={setSearch} autoCapitalize="none" />

      {!activity.loaded && !server.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : rows.length === 0 ? (
        <Notice tone="info">{term || filter !== 'ALL' ? 'No gift matches.' : 'No gifts yet. Admin allocates gifts to your doctors from the web portal.'}</Notice>
      ) : null}
      {visible.map((g, i) => {
        const rec = local.get(g.id);
        const mine = own(g);
        return (
          <NumberedRow key={g.id} n={i + 1}>
            <InfoCard>
              <View style={styles.spread}>
                <View style={styles.grow}>
                  <ThemedText type="smallBold">{g.productName}</ThemedText>
                  <ThemedText type="small">{`For ${g.doctorName || doctorName(g.doctorId)}${isManager ? ` (${mine ? 'Own' : (g.userName ?? 'Team')})` : ''} · ${formatRupees(g.amountPaise)}`}</ThemedText>
                </View>
                <Pill text={done(g) || (rec && rec.status !== 'FAILED') ? 'Done' : 'Not done'} accent={done(g) || (rec && rec.status !== 'FAILED') ? 'green' : 'amber'} />
              </View>
              {done(g) && g.completedAt ? <ThemedText type="small" themeColor="textSecondary">{`Given on ${prettyDay(g.completedAt.slice(0, 10))}`}</ThemedText> : null}
              {done(g) ? null : rec?.status === 'FAILED' ? (
                <>
                  <ThemedText type="small" themeColor="danger">{rec.errorMessage ?? 'The server did not accept this.'}</ThemedText>
                  <View style={styles.row}>
                    <PrimaryButton label="Try again" variant="text" loading={busy === 'retry'} onPress={retry} />
                    <PrimaryButton label="Undo" variant="text" onPress={() => undo(rec)} />
                  </View>
                </>
              ) : rec ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">Marked done · waiting to be sent</ThemedText>
                  {rec.status === 'DRAFT' ? <PrimaryButton label="Undo" variant="text" onPress={() => undo(rec)} /> : null}
                </>
              ) : mine ? (
                <PrimaryButton label="Mark done" loading={busy === g.id} disabled={busy !== null} onPress={() => markDone(g.id)} />
              ) : null}
            </InfoCard>
          </NumberedRow>
        );
      })}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  spread: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.two },
});
