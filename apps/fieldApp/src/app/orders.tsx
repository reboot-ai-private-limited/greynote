import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ProductLinesEditor, type ProductLine } from '@/components/product-lines-editor';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { FyBanner } from '@/components/fy-banner';
import { ApiError, NetworkError } from '@/lib/api';
import { useFinancialYear } from '@/lib/financial-year';
import { cancelOrder, completeOrder, listOrders, type OrderStatus, type OrderView, type OutletType } from '@/lib/marketing';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { useSessionUser } from '@/lib/session';
import { createRecord, getRecord, removeRecord, sendNow, updateRecord, useColleagues, useOnline, useRecords, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { businessToday, formatWhen, prettyDay } from '@/offline/day';
import type { ConfigSnapshot, FieldMasterDataSnapshot } from '@/types/sync';

type OrderPayload = {
  outletType: OutletType;
  outletId: string;
  orderDate: string;
  remarks: string | null;
  lines: { productId: string; quantity: number; unitPricePaise: number }[];
};
type Tab = 'WAITING' | OrderStatus;
type Msg = { tone: 'danger' | 'success' | 'info'; text: string };

const TAB_LABEL: Record<Tab, string> = { WAITING: 'Waiting', PLACED: 'Placed', DONE: 'Done', CANCELLED: 'Cancelled' };
const OUTLET_TYPES: { value: OutletType; label: string }[] = [
  { value: 'CHEMIST', label: 'Chemist' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
];

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError || err instanceof Error ? err.message : 'Something went wrong. Please try again.';

/**
 * Orders (PRD §6.2): an order for one of your chemists or distributors, by product. There is no approval:
 * once it reaches the server it is Placed, and you mark it Done or Cancel it. Placing works offline —
 * the order is kept on the phone and sent when you're back online. Marking Done or Cancelled needs a connection.
 */
export default function OrdersScreen() {
  const online = useOnline();
  const me = useSessionUser();
  const { isManager } = useCurrentUser();
  const { colleagues } = useColleagues();
  const fy = useFinancialYear();
  const config = useCachedSource<ConfigSnapshot>('config');
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { records } = useRecords(['ORDER']);
  const server = useCachedFetch(`orders:${fy.year}`, listOrders, records.filter((r) => r.status === 'SYNCED').length);

  const [mode, setMode] = useState<'list' | 'form' | 'detail'>('list');
  const [tab, setTab] = useState<Tab>('PLACED');
  // A manager can also read the team's orders (the server already returns the downline's); they are not editable here.
  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const [editing, setEditing] = useState<OutboxRecord | null>(null);
  const [detail, setDetail] = useState<OrderView | null>(null);
  const [outletType, setOutletType] = useState<OutletType>('CHEMIST');
  const [outletId, setOutletId] = useState<string | null>(null);
  const [lines, setLines] = useState<ProductLine[]>([]);
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);

  const today = businessToday(config.data?.settings.BUSINESS_TIMEZONE);
  const products = master.data?.products ?? [];
  const chemists = master.data?.chemists ?? [];
  const distributors = master.data?.distributors ?? [];
  const outlets = outletType === 'CHEMIST' ? chemists : distributors;
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Product';
  const outletName = (type: OutletType, id: string) => (type === 'CHEMIST' ? chemists : distributors).find((o) => o.id === id)?.name ?? (type === 'CHEMIST' ? 'Chemist' : 'Distributor');

  const waiting = records.filter((r) => !r.deleted && r.status !== 'SYNCED').reverse();
  const mine = (server.data ?? []).filter((o) => (scope === 'team' ? !!me && o.userId !== me.id : !me || o.userId === me.id));
  const byStatus = (s: OrderStatus) => mine.filter((o) => o.status === s);
  const ownerName = (userId: string) => colleagues.find((c) => c.id === userId)?.name ?? 'Team member';
  const isMine = (o: OrderView) => !me || o.userId === me.id;

  /** The price a line starts with: PTS for a distributor, PTR for a chemist, else the MRP. */
  const defaultPrice = (productId: string, type: OutletType) => {
    const p = products.find((x) => x.id === productId);
    const paise = (type === 'DISTRIBUTOR' ? p?.ptsPaise : p?.ptrPaise) ?? p?.mrpPaise ?? null;
    return paise ? String(paise / 100) : '';
  };

  const total = lines.reduce((sum, l) => {
    const qty = Number(l.values[0]);
    const price = rupeesToPaise(l.values[1] ?? '');
    return sum + (qty > 0 && price ? qty * price : 0);
  }, 0);

  const startForm = (record: OutboxRecord | null) => {
    setMsg(null);
    setEditing(record);
    if (!record) {
      setOutletType('CHEMIST');
      setOutletId(null);
      setLines([]);
      setRemarks('');
    } else {
      const p = record.payload as OrderPayload;
      setOutletType(p.outletType);
      setOutletId(p.outletId);
      setLines(p.lines.map((l) => ({ productId: l.productId, values: [String(l.quantity), String(l.unitPricePaise / 100)] })));
      setRemarks(p.remarks ?? '');
    }
    setMode('form');
  };

  const save = async () => {
    if (!outletId) return setMsg({ tone: 'danger', text: `Choose the ${outletType === 'CHEMIST' ? 'chemist' : 'distributor'}.` });
    if (lines.length === 0) return setMsg({ tone: 'danger', text: 'Add at least one product.' });
    const payloadLines: OrderPayload['lines'] = [];
    for (const l of lines) {
      const quantity = Number(l.values[0]);
      const unitPricePaise = rupeesToPaise(l.values[1] ?? '');
      if (!Number.isInteger(quantity) || quantity < 1) return setMsg({ tone: 'danger', text: `Enter a whole quantity for ${productName(l.productId)}.` });
      if (unitPricePaise === null) return setMsg({ tone: 'danger', text: `Enter the price for ${productName(l.productId)} in rupees.` });
      payloadLines.push({ productId: l.productId, quantity, unitPricePaise });
    }
    const payload: OrderPayload = { outletType, outletId, orderDate: today, remarks: remarks.trim() || null, lines: payloadLines };
    setBusy('save');
    try {
      const record = editing ? await updateRecord(editing.clientId, payload) : await createRecord('ORDER', payload);
      setMode('list');
      setTab(online ? 'PLACED' : 'WAITING');
      if (!online) {
        setMsg({ tone: 'info', text: 'Saved on this phone. It will be sent when you’re online.' });
      } else {
        await sendNow(['ORDER']);
        const after = await getRecord(record.clientId);
        server.reload();
        if (after?.status === 'FAILED') {
          setTab('WAITING');
          setMsg({ tone: 'danger', text: after.errorMessage ?? 'The server did not accept this order.' });
        } else {
          setMsg({ tone: 'success', text: 'Order placed.' });
        }
      }
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const retry = async () => {
    setBusy('retry');
    try {
      await sendNow(['ORDER']);
      server.reload();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (r: OutboxRecord) => {
    try {
      await removeRecord(r.clientId);
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    }
  };

  const finish = async (order: OrderView, to: 'DONE' | 'CANCELLED') => {
    setBusy(to);
    try {
      const updated = to === 'DONE' ? await completeOrder(order.id) : await cancelOrder(order.id);
      setDetail(updated);
      server.reload();
      setMsg({ tone: 'success', text: to === 'DONE' ? 'Marked done.' : 'Order cancelled.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  if (mode === 'form') {
    return (
      <ScreenShell title={editing ? 'Change order' : 'New order'}>
        <View style={styles.block}>
          <ThemedText type="smallBold">Order for</ThemedText>
          <ChoiceChips
            options={OUTLET_TYPES}
            value={outletType}
            onChange={(t) => {
              setOutletType(t);
              setOutletId(null);
              setLines((ls) => ls.map((l) => ({ ...l, values: [l.values[0] ?? '', defaultPrice(l.productId, t)] })));
            }}
            disabled={busy !== null}
          />
        </View>
        <OutletPicker
          label={outletType === 'CHEMIST' ? 'Chemist' : 'Distributor'}
          options={outlets.map((o) => ({ id: o.id, name: o.name, subtitle: o.address }))}
          value={outletId}
          onChange={setOutletId}
          disabled={busy !== null}
          emptyText={`No ${outletType === 'CHEMIST' ? 'chemists' : 'distributors'} are on your routes yet.`}
        />
        <ProductLinesEditor
          products={products.map((p) => ({ id: p.id, name: p.name, subtitle: p.packSize ?? undefined }))}
          columns={[{ label: 'Quantity' }, { label: 'Price (₹)', decimal: true }]}
          lines={lines}
          onChange={(l) => (setLines(l), setMsg(null))}
          defaults={(id) => ['', defaultPrice(id, outletType)]}
          disabled={busy !== null}
          footer={(l) => {
            const qty = Number(l.values[0]);
            const price = rupeesToPaise(l.values[1] ?? '');
            return qty > 0 && price ? `Amount ${formatRupees(qty * price)}` : null;
          }}
        />
        <TextField label="Remarks (optional)" value={remarks} onChangeText={setRemarks} multiline maxLength={1000} editable={busy === null} />
        <ThemedText type="smallBold">{`Total ${formatRupees(total)}`}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          The server works out the final amounts from your quantities and prices.
        </ThemedText>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <PrimaryButton label={online ? 'Place order' : 'Save on this phone'} loading={busy === 'save'} onPress={save} />
        <PrimaryButton label="Cancel" variant="text" disabled={busy !== null} onPress={() => setMode('list')} />
      </ScreenShell>
    );
  }

  if (mode === 'detail' && detail) {
    return (
      <ScreenShell title="Order">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <ThemedView type="backgroundElement" style={styles.card}>
          {isMine(detail) ? null : <ThemedText type="small" themeColor="textSecondary">{`Placed by ${ownerName(detail.userId)}`}</ThemedText>}
          <ThemedText type="smallBold">{outletName(detail.outlet.type, detail.outlet.id)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {`${detail.outlet.type === 'CHEMIST' ? 'Chemist' : 'Distributor'} · ${prettyDay(detail.orderDate)} · ${TAB_LABEL[detail.status]}`}
          </ThemedText>
          {detail.items.map((i) => (
            <ThemedText key={i.productId} type="small">{`${productName(i.productId)} — ${i.quantity} × ${formatRupees(i.unitPricePaise)} = ${formatRupees(i.amountPaise)}`}</ThemedText>
          ))}
          <ThemedText type="smallBold">{`Total ${formatRupees(detail.totalAmountPaise)}`}</ThemedText>
          {detail.remarks ? <ThemedText type="small">{detail.remarks}</ThemedText> : null}
        </ThemedView>
        {detail.status === 'PLACED' && isMine(detail) ? (
          online ? (
            <>
              <PrimaryButton label="Mark done" loading={busy === 'DONE'} disabled={busy !== null} onPress={() => finish(detail, 'DONE')} />
              <PrimaryButton label="Cancel this order" variant="text" loading={busy === 'CANCELLED'} disabled={busy !== null} onPress={() => finish(detail, 'CANCELLED')} />
            </>
          ) : (
            <Notice tone="info">Marking an order done or cancelling it needs a connection.</Notice>
          )
        ) : null}
        <PrimaryButton label="Back to orders" variant="text" onPress={() => setMode('list')} />
      </ScreenShell>
    );
  }

  const shown = tab === 'WAITING' ? [] : byStatus(tab);
  return (
    <ScreenShell title="Orders">
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <FyBanner />
      {fy.isPast || scope === 'team' ? null : <PrimaryButton label="New order" onPress={() => startForm(null)} />}
      {isManager ? (
        <ChoiceChips
          options={[{ value: 'mine' as const, label: 'My orders' }, { value: 'team' as const, label: 'Team orders' }]}
          value={scope}
          onChange={(v) => (setMsg(null), setScope(v), setTab('PLACED'))}
        />
      ) : null}
      <ChoiceChips
        options={(scope === 'team' ? (['PLACED', 'DONE', 'CANCELLED'] as Tab[]) : (['PLACED', 'DONE', 'CANCELLED', 'WAITING'] as Tab[])).map((t) => ({ value: t, label: t === 'WAITING' && waiting.length ? `Waiting (${waiting.length})` : TAB_LABEL[t] }))}
        value={tab}
        onChange={(t) => (setMsg(null), setTab(t))}
      />
      {server.error && online ? <Notice tone="danger">{server.error}</Notice> : null}
      {tab !== 'WAITING' && server.stale && server.fetchedAt ? <Notice tone="info">{`Showing the list from ${formatWhen(server.fetchedAt)}.`}</Notice> : null}

      {tab === 'WAITING' ? (
        waiting.length === 0 ? (
          <Notice tone="info">Nothing is waiting to be sent.</Notice>
        ) : (
          waiting.map((r) => {
            const p = r.payload as OrderPayload;
            const sum = p.lines.reduce((s, l) => s + l.quantity * l.unitPricePaise, 0);
            return (
              <ThemedView key={r.clientId} type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{`${outletName(p.outletType, p.outletId)} · ${formatRupees(sum)}`}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{`${p.lines.length} product${p.lines.length === 1 ? '' : 's'} · ${prettyDay(p.orderDate)}`}</ThemedText>
                <ThemedText type="small" themeColor={r.status === 'FAILED' ? 'danger' : 'textSecondary'}>
                  {r.status === 'FAILED' ? (r.errorMessage ?? 'Not accepted') : 'Saved on this phone, waiting to be sent'}
                </ThemedText>
                {r.status !== 'QUEUED' ? (
                  <View style={styles.row}>
                    {r.status === 'FAILED' ? <PrimaryButton label="Try again" variant="text" loading={busy === 'retry'} onPress={retry} /> : null}
                    <PrimaryButton label="Change" variant="text" onPress={() => startForm(r)} />
                    <PrimaryButton label="Remove" variant="text" onPress={() => remove(r)} />
                  </View>
                ) : null}
              </ThemedView>
            );
          })
        )
      ) : server.loading && !server.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : shown.length === 0 ? (
        <Notice tone="info">{server.data ? `No ${TAB_LABEL[tab].toLowerCase()} orders.` : 'Connect once to load the orders.'}</Notice>
      ) : (
        shown.map((o) => (
          <Pressable key={o.id} accessibilityRole="button" onPress={() => (setMsg(null), setDetail(o), setMode('detail'))}>
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{`${scope === 'team' ? ownerName(o.userId) : outletName(o.outlet.type, o.outlet.id)} · ${formatRupees(o.totalAmountPaise)}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{`${o.outlet.type === 'CHEMIST' ? 'Chemist' : 'Distributor'} · ${prettyDay(o.orderDate)} · ${o.items.length} product${o.items.length === 1 ? '' : 's'}`}</ThemedText>
            </ThemedView>
          </Pressable>
        ))
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
