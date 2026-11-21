import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { NumberedRow } from '@/components/numbered-row';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, InfoCard, Pill, SummaryStrip, sym } from '@/components/ui-cards';
import { OutletPicker } from '@/components/outlet-picker';
import { Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useDebounced } from '@/hooks/use-debounced';
import { useWindowed } from '@/hooks/use-windowed';
import { giftStatusText, listGifts, requestGift, type GiftView } from '@/lib/gifts';
import { formatRupees } from '@/lib/money';
import { useSessionUser } from '@/lib/session';
import { createRecord, refreshNow, removeRecord, sendNow, useOnline, useRecords, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { prettyDay } from '@/offline/day';
import type { FieldActivitySnapshot, FieldMasterDataSnapshot } from '@/types/sync';

type Msg = { tone: 'danger' | 'success' | 'info'; text: string };
type Filter = 'ALL' | 'NOT_GIVEN' | 'DONE';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'NOT_GIVEN', label: 'Not given yet' },
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
  // Not given yet = asked for and waiting, plus accepted and still to hand over; a rejected one is neither.
  const notGivenYet = (g: GiftView) => g.status === 'REQUESTED' || g.status === 'PENDING';
  const rows = list
    .filter((g) => (filter === 'ALL' || (filter === 'DONE' ? done(g) : notGivenYet(g))) && (!term || `${g.doctorName} ${g.productName} ${g.userName ?? ''}`.toLowerCase().includes(term)))
    .sort((a, b) => b.allocatedAt.localeCompare(a.allocatedAt) || b.id.localeCompare(a.id));
  const { visible } = useWindowed(rows, `${filter}|${term}`);
  const notDone = list.filter(notGivenYet).length;
  const waitingAnswer = list.filter((g) => g.status === 'REQUESTED').length;

  const [asking, setAsking] = useState(false);
  const [askDoctor, setAskDoctor] = useState<string | null>(null);
  const [askName, setAskName] = useState('');
  const [askNote, setAskNote] = useState('');
  const myDoctors = (master.data?.doctors ?? []).map((d) => ({ id: d.id, name: d.name, subtitle: d.address }));

  const sendRequest = async () => {
    if (!askDoctor) return setMsg({ tone: 'danger', text: 'Choose the doctor the gift is for.' });
    if (!askName.trim()) return setMsg({ tone: 'danger', text: 'Name the gift you are asking for.' });
    if (!online) return setMsg({ tone: 'info', text: 'Connect to the internet to send a request.' });
    setBusy('ask');
    setMsg(null);
    try {
      await requestGift({ doctorId: askDoctor, productName: askName.trim(), note: askNote.trim() || null });
      setAsking(false);
      setAskDoctor(null);
      setAskName('');
      setAskNote('');
      setMsg({ tone: 'success', text: 'Request sent. Admin or Accounts will accept or reject it; you are told here and in your Inbox.' });
      server.reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not send the request.' });
    } finally {
      setBusy(null);
    }
  };

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

      {asking ? (
        <CardSection icon={sym('gift', 'redeem')} accent="pink" title="Request a gift">
          <OutletPicker label="Doctor" options={myDoctors} value={askDoctor} onChange={setAskDoctor} disabled={busy !== null} emptyText="No doctors are assigned to you yet." searchable />
          <TextField label="Gift" value={askName} onChangeText={setAskName} placeholder="e.g. Desk clock" maxLength={200} editable={busy === null} />
          <TextField label="Note (optional)" value={askNote} onChangeText={setAskNote} multiline maxLength={500} editable={busy === null} />
          <PrimaryButton label="Send request" loading={busy === 'ask'} onPress={() => void sendRequest()} />
          <PrimaryButton label="Cancel" variant="text" disabled={busy !== null} onPress={() => setAsking(false)} />
        </CardSection>
      ) : (
        <PrimaryButton label="Request a gift for a doctor" variant="text" onPress={() => { setMsg(null); setAsking(true); }} />
      )}

      <SummaryStrip
        items={[
          { label: 'Gifts', value: String(list.length).padStart(2, '0'), accent: 'blue' },
          { label: 'Not given yet', value: String(notDone).padStart(2, '0'), accent: notDone > 0 ? 'amber' : 'slate' },
          { label: 'Requested', value: String(waitingAnswer).padStart(2, '0'), accent: waitingAnswer > 0 ? 'indigo' : 'slate' },
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
                  <ThemedText type="small">{`For ${g.doctorName || doctorName(g.doctorId)}${isManager ? ` (${mine ? 'Own' : (g.userName ?? 'Team')})` : ''} · ${g.status === 'REQUESTED' ? 'amount set when accepted' : formatRupees(g.amountPaise)}`}</ThemedText>
                </View>
                <Pill
                  text={rec && rec.status !== 'FAILED' && g.status === 'PENDING' ? 'Done' : giftStatusText(g.status)}
                  accent={done(g) || (rec && rec.status !== 'FAILED' && g.status === 'PENDING') ? 'green' : g.status === 'REJECTED' ? 'red' : g.status === 'REQUESTED' ? 'indigo' : 'amber'}
                />
              </View>
              {done(g) && g.completedAt ? <ThemedText type="small" themeColor="textSecondary">{`Given on ${prettyDay(g.completedAt.slice(0, 10))}`}</ThemedText> : null}
              {g.status === 'REQUESTED' ? <ThemedText type="small" themeColor="textSecondary">{`Asked for${g.requestedByName ? ` by ${g.requestedByName}` : ''}${g.requestNote ? ` · ${g.requestNote}` : ''}. Waiting for Admin or Accounts.`}</ThemedText> : null}
              {g.status === 'REJECTED' ? <ThemedText type="small" themeColor="danger">{`Rejected${g.rejectReason ? `: ${g.rejectReason}` : '.'}`}</ThemedText> : null}
              {done(g) || g.status === 'REQUESTED' || g.status === 'REJECTED' ? null : rec?.status === 'FAILED' ? (
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
