import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ProductLinesEditor, type ProductLine } from '@/components/product-lines-editor';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { ApiError, NetworkError } from '@/lib/api';
import { listMissingStock, listStock, type MissingStockRow, type OutletType, type StockRow } from '@/lib/marketing';
import { createRecord, getRecord, removeRecord, sendNow, updateRecord, useOnline, useRecords, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { MonthStepper } from '@/components/month-stepper';
import { addMonths, businessToday, monthOf, prettyMonth } from '@/offline/day';
import type { ConfigSnapshot, FieldMasterDataSnapshot } from '@/types/sync';

type StockPayload = { outletType: OutletType; outletId: string; month: string; lines: { productId: string; openingQty: number; closingQty: number }[] };
type Msg = { tone: 'danger' | 'success' | 'info'; text: string };

const OUTLET_TYPES: { value: OutletType; label: string }[] = [
  { value: 'CHEMIST', label: 'Chemist' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
];

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError || err instanceof Error ? err.message : 'Something went wrong. Please try again.';

/**
 * Monthly Stock (PRD §6.2): the opening and closing count of each product at a chemist or distributor, for a
 * month. A month is open until the deadline day of the next month (a setting the phone is not sent); after that only
 * Admin can reopen it. The phone locks a month once it is surely closed — two or more months back, since the deadline
 * is never later than the 28th — and leaves the previous month to the server. Saving again for the same outlet and
 * month replaces the earlier count. Works offline — sent when you're back online.
 */
export default function MonthlyStockScreen() {
  const online = useOnline();
  const { isManager } = useCurrentUser();
  const config = useCachedSource<ConfigSnapshot>('config');
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const thisMonth = monthOf(businessToday(config.data?.settings.BUSINESS_TIMEZONE, new Date(), config.data?.settings.DAY_START_TIME));
  const [month, setMonth] = useState(thisMonth);
  const closed = month < addMonths(thisMonth, -1);
  const { records } = useRecords(['MONTHLY_STOCK']);
  const syncedCount = records.filter((r) => r.status === 'SYNCED').length;
  const counted = useCachedFetch<StockRow[]>(`stock:${month}`, () => listStock(month), syncedCount);
  const previous = useCachedFetch<StockRow[]>(`stock:${addMonths(month, -1)}`, () => listStock(addMonths(month, -1)));
  // The same key online and offline, so a manager still sees the last copy with no signal; non-managers never ask the server.
  const missingTeam = useCachedFetch<MissingStockRow[] | null>(
    isManager ? `missing-stock:${month}` : 'missing-stock:none',
    () => (isManager ? listMissingStock(month) : Promise.resolve(null)),
  );

  const [outletType, setOutletType] = useState<OutletType>('CHEMIST');
  const [outletId, setOutletId] = useState<string | null>(null);
  const [lines, setLines] = useState<ProductLine[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);

  const products = master.data?.products ?? [];
  const outlets = outletType === 'CHEMIST' ? (master.data?.chemists ?? []) : (master.data?.distributors ?? []);
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Product';
  const outletName = (type: OutletType, id: string) =>
    ((type === 'CHEMIST' ? master.data?.chemists : master.data?.distributors) ?? []).find((o) => o.id === id)?.name ?? (type === 'CHEMIST' ? 'Chemist' : 'Distributor');

  const waiting = records.filter((r) => !r.deleted && r.status !== 'SYNCED').reverse();
  const waitingFor = (type: OutletType, id: string, m: string) =>
    waiting.find((r) => {
      const p = r.payload as StockPayload;
      return p.outletType === type && p.outletId === id && p.month === m;
    });
  const rowsOf = (rows: StockRow[] | null, type: OutletType, id: string) => (rows ?? []).filter((r) => r.outlet.type === type && r.outlet.id === id);
  const isCounted = (type: OutletType, id: string) => rowsOf(counted.data, type, id).length > 0;
  // Only once the month's counts have loaded: before that every outlet would read as missing.
  const missingMine = counted.data === null ? [] : outlets.filter((o) => !isCounted(outletType, o.id));

  const choose = (id: string) => {
    setOutletId(id);
    setMsg(null);
    const local = waitingFor(outletType, id, month);
    if (local) {
      const p = local.payload as StockPayload;
      setLines(p.lines.map((l) => ({ productId: l.productId, values: [String(l.openingQty), String(l.closingQty)] })));
    } else {
      setLines(rowsOf(counted.data, outletType, id).map((r) => ({ productId: r.productId, values: [String(r.openingQty), String(r.closingQty)] })));
    }
    setEditing(true);
  };

  /** A new row's opening starts at last month's closing for this outlet, if that count exists. */
  const openingDefault = (productId: string) => {
    const row = rowsOf(previous.data, outletType, outletId ?? '').find((r) => r.productId === productId);
    return row ? String(row.closingQty) : '';
  };

  const save = async () => {
    if (!outletId) return setMsg({ tone: 'danger', text: 'Choose the outlet.' });
    if (lines.length === 0) return setMsg({ tone: 'danger', text: 'Add at least one product.' });
    const payloadLines: StockPayload['lines'] = [];
    for (const l of lines) {
      const [open, close] = [l.values[0] ?? '', l.values[1] ?? ''];
      if (open === '' || close === '') return setMsg({ tone: 'danger', text: `Enter both counts for ${productName(l.productId)} (0 if none).` });
      payloadLines.push({ productId: l.productId, openingQty: Number(open), closingQty: Number(close) });
    }
    const payload: StockPayload = { outletType, outletId, month, lines: payloadLines };
    setBusy('save');
    try {
      const existing = waitingFor(outletType, outletId, month);
      const record = existing && existing.status !== 'QUEUED' ? await updateRecord(existing.clientId, payload) : await createRecord('MONTHLY_STOCK', payload);
      setEditing(false);
      setOutletId(null);
      setLines([]);
      if (!online) {
        setMsg({ tone: 'info', text: 'Saved on this phone. It will be sent when you’re online.' });
      } else {
        await sendNow(['MONTHLY_STOCK']);
        const after = await getRecord(record.clientId);
        counted.reload();
        setMsg(
          after?.status === 'FAILED'
            ? { tone: 'danger', text: after.errorMessage ?? 'The server did not accept this count.' }
            : { tone: 'success', text: 'Stock count saved.' },
        );
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
      await sendNow(['MONTHLY_STOCK']);
      counted.reload();
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

  if (editing) {
    return (
      <ScreenShell title={outletId ? outletName(outletType, outletId) : 'Stock count'}>
        <ThemedText type="small" themeColor="textSecondary">{`${prettyMonth(month)} · ${outletType === 'CHEMIST' ? 'Chemist' : 'Distributor'}`}</ThemedText>
        <ProductLinesEditor
          products={products.map((p) => ({ id: p.id, name: p.name, subtitle: p.packSize ?? undefined }))}
          columns={[{ label: 'Opening' }, { label: 'Closing' }]}
          lines={lines}
          onChange={(l) => (setLines(l), setMsg(null))}
          defaults={(id) => [openingDefault(id), '']}
          disabled={busy !== null}
        />
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <PrimaryButton label={online ? 'Save count' : 'Save on this phone'} loading={busy === 'save'} onPress={save} />
        <PrimaryButton label="Cancel" variant="text" disabled={busy !== null} onPress={() => (setEditing(false), setMsg(null))} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Monthly Stock">
      <MonthStepper value={month} onChange={(m) => (setMsg(null), setMonth(m))} max={thisMonth} />
      {closed ? <Notice tone="info">{`${prettyMonth(month)} is closed for stock counts. Only an Admin can reopen it.`}</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {counted.error && online ? <Notice tone="danger">{counted.error}</Notice> : null}

      <ChoiceChips options={OUTLET_TYPES} value={outletType} onChange={(t) => (setOutletType(t), setOutletId(null))} />

      {missingMine.length > 0 && !closed ? (
        <Notice tone="warning" title="Missing stock counts">
          {`${missingMine.length} of ${outlets.length} ${outletType === 'CHEMIST' ? 'chemists' : 'distributors'} have not had stock counted for ${prettyMonth(month)}.`}
        </Notice>
      ) : null}

      <OutletPicker
        label={`Count stock at a ${outletType === 'CHEMIST' ? 'chemist' : 'distributor'}`}
        options={outlets.map((o) => ({ id: o.id, name: o.name, subtitle: waitingFor(outletType, o.id, month) ? 'Waiting to be sent' : isCounted(outletType, o.id) ? (closed ? 'Counted' : 'Counted — tap to change') : closed ? 'Not counted' : 'Not counted yet' }))}
        disabled={closed}
        value={outletId}
        onChange={choose}
        emptyText={`No ${outletType === 'CHEMIST' ? 'chemists' : 'distributors'} are on your routes yet.`}
      />

      {missingTeam.data && missingTeam.data.length > 0 ? (
        <>
          <ThemedText type="smallBold">Team members with missing counts</ThemedText>
          {missingTeam.data.map((row) => (
            <ThemedView key={row.userId} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{row.userName}</ThemedText>
              <ThemedText type="small" themeColor="danger">
                {`${row.outlets.length} outlet${row.outlets.length === 1 ? '' : 's'} missing count: ${row.outlets.map((o) => o.name).slice(0, 3).join(', ')}${row.outlets.length > 3 ? '…' : ''}`}
              </ThemedText>
            </ThemedView>
          ))}
        </>
      ) : null}

      {waiting.length > 0 ? (
        <>
          <ThemedText type="smallBold">Waiting to be sent</ThemedText>
          {waiting.map((r) => {
            const p = r.payload as StockPayload;
            return (
              <ThemedView key={r.clientId} type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{`${outletName(p.outletType, p.outletId)} · ${prettyMonth(p.month)}`}</ThemedText>
                <ThemedText type="small" themeColor={r.status === 'FAILED' ? 'danger' : 'textSecondary'}>
                  {r.status === 'FAILED' ? (r.errorMessage ?? 'Not accepted') : `${p.lines.length} product${p.lines.length === 1 ? '' : 's'} · saved on this phone`}
                </ThemedText>
                {r.status !== 'QUEUED' ? (
                  <View style={styles.row}>
                    {r.status === 'FAILED' ? <PrimaryButton label="Try again" variant="text" loading={busy === 'retry'} onPress={retry} /> : null}
                    <PrimaryButton label="Remove" variant="text" onPress={() => remove(r)} />
                  </View>
                ) : null}
              </ThemedView>
            );
          })}
        </>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
