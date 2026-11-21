import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ProductGivenEditor, type GivenLine } from '@/components/product-given-editor';
import { SampleMatrix } from '@/components/sample-matrix';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, InfoCard, Pill, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { cancelSampleRequest, createSampleRequest, getSampleAccount, listMySampleRequests, statusText, type SampleAccount, type SampleKind, type SampleRequestView } from '@/lib/sample-requests';
import { useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import type { FieldMasterDataSnapshot } from '@/types/sync';

type Msg = { tone: 'danger' | 'success' | 'info'; text: string };
const KINDS: { value: SampleKind; label: string }[] = [
  { value: 'SAMPLE', label: 'Sample' },
  { value: 'LBL', label: 'LBL' },
];
const accent = (s: SampleRequestView['status']) => (s === 'DONE' ? 'green' : s === 'CANCELLED' ? 'slate' : 'amber');

/**
 * Sample & LBL: ask for samples or LBL (a product's page to leave with a doctor), see what was credited once Admin, Accounts or HR mark the request done, and
 * how much you have given (the doctor call has no balance check). Requests need a connection.
 */
export default function SampleRequestsScreen() {
  const online = useOnline();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const [kind, setKind] = useState<SampleKind>('SAMPLE');
  const [lines, setLines] = useState<GivenLine[]>([]);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [tick, setTick] = useState(0);

  const products = useMemo(() => (master.data?.products ?? []).map((p) => ({ id: p.id, name: p.name, packSize: p.packSize })), [master.data]);
  const account = useCachedFetch<SampleAccount>('sample-account:me', () => getSampleAccount(), tick);
  const mine = useCachedFetch<SampleRequestView[]>('sample-requests:mine', () => listMySampleRequests(), tick);
  const reload = () => setTick((n) => n + 1);

  const send = async () => {
    const valid = lines.filter((l) => l.quantity > 0);
    if (valid.length === 0) return setMsg({ tone: 'danger', text: 'Add at least one product with a quantity.' });
    if (!online) return setMsg({ tone: 'info', text: 'Connect to the internet to send a request.' });
    setBusy(true);
    setMsg(null);
    try {
      await createSampleRequest({ kind, lines: valid, remarks: remarks.trim() || null });
      setLines([]);
      setRemarks('');
      setMsg({ tone: 'success', text: 'Request sent. You are credited once Admin, Accounts or HR mark it done.' });
      reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not send the request.' });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await cancelSampleRequest(id);
      reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: err instanceof Error ? err.message : 'Could not cancel it.' });
    }
  };

  return (
    <ScreenShell title="Sample & LBL" subtitle="Request them, and see what you got and gave" onRefresh={reload} refreshing={account.refreshing}>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {!online ? <Notice tone="info">You’re offline. Requests need a connection; your last account is shown below.</Notice> : null}

      <CardSection icon={sym('square.and.pencil', 'edit_note')} accent="blue" title="New request">
        <ChoiceChips options={KINDS} value={kind} onChange={setKind} disabled={busy} />
        <ThemedText type="small" themeColor="textSecondary">
          {kind === 'SAMPLE' ? 'Samples to give doctors. Choose the products and how many of each.' : 'LBL is a product’s page to leave with a doctor. Choose the products and how many copies.'}
        </ThemedText>
        <ProductGivenEditor products={products} value={lines} onChange={setLines} withQuantity disabled={busy} />
        <TextField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline maxLength={500} editable={!busy} />
        <PrimaryButton label="Send request" loading={busy} onPress={() => void send()} />
      </CardSection>

      <CardSection icon={sym('pills', 'medication')} accent="amber" title="My samples">
        <SampleMatrix rows={account.data?.samples ?? []} empty="Nothing requested yet." />
      </CardSection>
      <CardSection icon={sym('doc.text', 'description')} accent="teal" title="My LBL">
        <SampleMatrix rows={account.data?.lbl ?? []} empty="Nothing requested yet." />
      </CardSection>
      <ThemedText type="small" themeColor="textSecondary">Asked = requested, Got = credited by Admin/Accounts/HR, Gave = given in your doctor calls, Left = Got − Gave.</ThemedText>

      <ThemedText type="smallBold">My requests</ThemedText>
      {(mine.data ?? []).length === 0 ? <Notice tone="info">No requests yet.</Notice> : null}
      {(mine.data ?? []).map((r) => (
        <InfoCard key={r.id}>
          <View style={styles.spread}>
            <ThemedText type="smallBold">{`${r.kind === 'SAMPLE' ? 'Sample' : 'LBL'} · ${new Date(r.requestedAt).toLocaleDateString()}`}</ThemedText>
            <Pill text={statusText(r.status)} accent={accent(r.status)} />
          </View>
          <ThemedText type="small">{r.lines.map((l) => `${l.productName} × ${l.creditedQuantity ?? l.quantity}${l.creditedQuantity !== null && l.creditedQuantity !== l.quantity ? ` (asked ${l.quantity})` : ''}`).join(', ')}</ThemedText>
          {r.remarks ? <ThemedText type="small" themeColor="textSecondary">{r.remarks}</ThemedText> : null}
          {r.status === 'REQUESTED' ? <PrimaryButton label="Cancel request" variant="text" onPress={() => void cancel(r.id)} /> : null}
        </InfoCard>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({ spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two } });
