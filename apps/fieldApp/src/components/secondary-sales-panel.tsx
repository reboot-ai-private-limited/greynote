import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ProductLinesEditor, type ProductLine } from '@/components/product-lines-editor';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CardSection, InfoCard, Pill, StatusBanner, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useFormErrors } from '@/hooks/use-form-errors';
import { ApiError, NetworkError } from '@/lib/api';
import { useFinancialYear } from '@/lib/financial-year';
import { deliveredOf, listOrders, listStock, type OrderView, type OutletType, type StockRow } from '@/lib/marketing';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { SECONDARY_STATUS_TEXT, getEmployeeSales, saveEmployeeSecondary, submitEmployeeSecondary, type SecondaryStatus } from '@/lib/sales';
import { useSessionUser } from '@/lib/session';
import { createRecord, getRecord, removeRecord, sendNow, updateRecord, useOnline, useRecords, type OutboxRecord } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { addMonths, prettyMonth } from '@/offline/day';
import type { FieldMasterDataSnapshot } from '@/types/sync';

const STATUS_ACCENT: Record<SecondaryStatus, Accent> = { DRAFT: 'slate', PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' };
const STOCK_FIELD_ORDER = ['distributor', 'lines'];

type StockPayload = {
  outletType: OutletType;
  outletId: string;
  month: string;
  lines: { productId: string; openingQty: number; closingQty: number }[];
};

/** The server's reasons in the phone's words; anything else shows the server's own message. */
const errorText = (err: unknown) => {
  if (err instanceof ApiError) {
    if (err.data?.code === 'SECONDARY_LOCKED') return 'This month is with your manager or approved, so it can’t be changed. Ask for it to be sent back, or wait for the decision.';
    if (err.data?.code === 'SECONDARY_NEEDS_PTR') return 'This product has no PTS price, so enter units, not an amount.';
  }
  return err instanceof ApiError || err instanceof NetworkError || err instanceof Error ? err.message : 'Something went wrong. Please try again.';
};

/**
 * Distributor stock count (14 Oct): pick a distributor assigned to you or on your routes, then pick products and enter
 * opening and closing stock. Units delivered on Done distributor orders are shown per product so you can see the resulting
 * secondary (opening + delivered − closing) and its value at PTS, which feeds your monthly achievement. Works offline via
 * the `MONTHLY_STOCK` outbox queue.
 */
export function DistributorStockPanel({ month, locked }: { month: string; locked: boolean }) {
  const online = useOnline();
  const fy = useFinancialYear();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { records } = useRecords(['MONTHLY_STOCK']);
  const syncedCount = records.filter((r) => r.status === 'SYNCED').length;
  const prevMonth = addMonths(month, -1);

  const counted = useCachedFetch<StockRow[]>(`stock:${month}`, () => listStock(month), syncedCount);
  const previous = useCachedFetch<StockRow[]>(`stock:${prevMonth}`, () => listStock(prevMonth), syncedCount);
  const orders = useCachedFetch<OrderView[]>(`orders:${fy.year}`, listOrders);

  const [distributorId, setDistributorId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ key: string; lines: ProductLine[] } | null>(null);
  const [busy, setBusy] = useState<'save' | 'retry' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'info'; text: string } | null>(null);
  const fe = useFormErrors(STOCK_FIELD_ORDER);
  const [lineErrors, setLineErrors] = useState<Record<string, (string | undefined)[]>>({});

  const distributors = [...(master.data?.distributors ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const products = [...(master.data?.products ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const productById = (id: string) => products.find((p) => p.id === id);
  const productName = (id: string) => productById(id)?.name ?? 'Product';
  const outletName = (type: OutletType, id: string) =>
    (type === 'CHEMIST' ? (master.data?.chemists ?? []) : distributors).find((o) => o.id === id)?.name ??
    (type === 'CHEMIST' ? 'Chemist' : 'Distributor');

  const outsideYear = month < fy.firstMonth || month > fy.lastMonth;
  const readOnly = fy.isPast || outsideYear || locked;

  const waiting = records.filter((r) => !r.deleted && r.status !== 'SYNCED').reverse();
  const waitingFor = (id: string, m: string) =>
    waiting.find((r) => {
      const p = r.payload as StockPayload;
      return p.outletType === 'DISTRIBUTOR' && p.outletId === id && p.month === m;
    });
  const rowsOf = (rows: StockRow[] | null, id: string) =>
    (rows ?? []).filter((r) => r.outlet.type === 'DISTRIBUTOR' && r.outlet.id === id);
  const isCounted = (id: string) => Boolean(waitingFor(id, month)) || rowsOf(counted.data, id).length > 0;
  const missingMine = counted.data === null ? [] : distributors.filter((d) => !isCounted(d.id));

  const draftKey = `${month}:${distributorId ?? ''}`;
  const savedLines = (): ProductLine[] => {
    if (!distributorId) return [];
    const local = waitingFor(distributorId, month);
    if (local) {
      const p = local.payload as StockPayload;
      return p.lines.map((l) => ({ productId: l.productId, values: [String(l.openingQty), String(l.closingQty)] }));
    }
    return rowsOf(counted.data, distributorId).map((r) => ({
      productId: r.productId,
      values: [String(r.openingQty), String(r.closingQty)],
    }));
  };
  const lines = draft?.key === draftKey ? draft.lines : savedLines();

  /** Pre-fill a newly added product's opening stock from last month's closing stock for this distributor. */
  const openingDefault = (productId: string) => {
    if (!distributorId) return '';
    const localPrev = waitingFor(distributorId, prevMonth);
    const localLine = (localPrev?.payload as StockPayload | undefined)?.lines.find((l) => l.productId === productId);
    if (localLine) return String(localLine.closingQty);
    const row = rowsOf(previous.data, distributorId).find((r) => r.productId === productId);
    return row ? String(row.closingQty) : '';
  };

  /** Units delivered (supplied + free) on Done orders for the selected distributor in `month`. */
  const deliveredFor = (productId: string) => {
    if (!distributorId) return 0;
    let sum = 0;
    for (const o of orders.data ?? []) {
      if (o.status !== 'DONE' || o.outlet.type !== 'DISTRIBUTOR' || o.outlet.id !== distributorId || !o.orderDate.startsWith(month)) continue;
      for (const item of o.items) {
        if (item.productId !== productId) continue;
        const d = deliveredOf(item);
        sum += d.suppliedQty + d.freeQty;
      }
    }
    return sum;
  };

  const lineSecondary = (l: ProductLine) => {
    const [openText, closeText] = [l.values[0] ?? '', l.values[1] ?? ''];
    const delivered = deliveredFor(l.productId);
    const pts = productById(l.productId)?.ptsPaise ?? null;
    if (openText === '' || closeText === '') return { delivered, pts, rawSecondary: null, secondaryQty: 0, secondaryPaise: 0 };
    const rawSecondary = Number(openText) + delivered - Number(closeText);
    const secondaryQty = Math.max(0, rawSecondary);
    return { delivered, pts, rawSecondary, secondaryQty, secondaryPaise: pts ? secondaryQty * pts : 0 };
  };

  const totalSecondaryUnits = lines.reduce((sum, l) => sum + lineSecondary(l).secondaryQty, 0);
  const totalSecondaryPaise = lines.reduce((sum, l) => sum + lineSecondary(l).secondaryPaise, 0);

  const chooseDistributor = (id: string) => {
    setDistributorId(id);
    setDraft(null);
    setMsg(null);
    setLineErrors({});
    fe.clearAll();
  };

  const changeLines = (next: ProductLine[]) => {
    setDraft({ key: draftKey, lines: next });
    setMsg(null);
    setLineErrors({});
    fe.clear('lines');
  };

  const save = async () => {
    const problems: Record<string, string> = {};
    const rowProblems: Record<string, (string | undefined)[]> = {};
    if (!distributorId) problems.distributor = 'Choose the distributor.';
    if (lines.length === 0) problems.lines = 'Add at least one product.';
    const payloadLines: StockPayload['lines'] = [];
    for (const l of lines) {
      const [openText, closeText] = [l.values[0] ?? '', l.values[1] ?? ''];
      const openNum = Number(openText);
      const closeNum = Number(closeText);
      const openProblem = openText === '' || !Number.isInteger(openNum) || openNum < 0 ? 'Enter opening units (0 or more).' : undefined;
      const closeProblem = closeText === '' || !Number.isInteger(closeNum) || closeNum < 0 ? 'Enter closing units (0 or more).' : undefined;
      if (openProblem || closeProblem) {
        rowProblems[l.productId] = [openProblem, closeProblem];
        problems.lines = `Check ${productName(l.productId)}: ${openProblem ?? closeProblem}`;
      } else {
        payloadLines.push({ productId: l.productId, openingQty: openNum, closingQty: closeNum });
      }
    }
    if (!distributorId || Object.keys(problems).length > 0) {
      setMsg({ tone: 'danger', text: 'Fix the fields marked in red.' });
      setLineErrors(rowProblems);
      return fe.fail(problems);
    }
    setLineErrors({});
    fe.clearAll();
    const payload: StockPayload = { outletType: 'DISTRIBUTOR', outletId: distributorId, month, lines: payloadLines };
    setBusy('save');
    setMsg(null);
    try {
      const existing = waitingFor(distributorId, month);
      const record =
        existing && existing.status !== 'QUEUED'
          ? await updateRecord(existing.clientId, payload)
          : await createRecord('MONTHLY_STOCK', payload);
      setDraft(null);
      if (!online) {
        setMsg({ tone: 'info', text: 'Saved on this phone. It will be sent when you’re online.' });
      } else {
        await sendNow(['MONTHLY_STOCK']);
        const after = await getRecord(record.clientId);
        counted.reload();
        if (after?.status === 'FAILED') {
          setMsg({ tone: 'danger', text: after.errorMessage ?? 'The server did not accept this stock count.' });
        } else {
          setMsg({ tone: 'success', text: `Saved stock count for ${outletName('DISTRIBUTOR', distributorId)} (${prettyMonth(month)}).` });
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

  return (
    <View style={styles.stack}>
      <Notice tone="info" title="Counts toward your achievement">
        Choose a distributor first, then add products with their opening and closing stock. Your secondary achievement is worked out from opening + Done order deliveries − closing, valued at PTS.
      </Notice>
      {outsideYear && !locked ? <Notice tone="info">This month is outside the selected financial year, so it can only be read.</Notice> : null}
      {counted.error && online ? <Notice tone="danger">{counted.error}</Notice> : null}
      {counted.stale && counted.fetchedAt && !online ? <Notice tone="info">Showing the last copy from this phone.</Notice> : null}
      {missingMine.length > 0 && !readOnly ? (
        <Notice tone="warning" title="Missing stock counts">
          {`${missingMine.length} of ${distributors.length} distributor${distributors.length === 1 ? '' : 's'} ${missingMine.length === 1 ? 'has' : 'have'} not had stock counted for ${prettyMonth(month)}.`}
        </Notice>
      ) : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <CardSection icon={sym('building.2', 'domain')} accent="orange" title="1. Choose distributor">
        <FormField form={fe} name="distributor">
          <OutletPicker
            label="Distributor"
            options={distributors.map((d) => {
              const statusLabel = waitingFor(d.id, month)
                ? 'Waiting to be sent'
                : rowsOf(counted.data, d.id).length > 0
                  ? readOnly
                    ? 'Counted'
                    : 'Counted — tap to change'
                  : readOnly
                    ? 'Not counted'
                    : 'Not counted yet';
              return {
                id: d.id,
                name: d.name,
                subtitle: [d.address, statusLabel].filter(Boolean).join(' · '),
              };
            })}
            value={distributorId}
            onChange={chooseDistributor}
            disabled={busy !== null}
            emptyText="No distributors are assigned to you or on your routes yet."
          />
        </FormField>
      </CardSection>

      {distributorId ? (
        <>
          <SummaryStrip
            items={[
              { label: 'Products', value: String(lines.length).padStart(2, '0'), accent: 'blue' },
              { label: 'Secondary', value: totalSecondaryUnits, accent: 'green' },
              { label: 'Value at PTS', value: formatRupees(totalSecondaryPaise), accent: 'teal' },
            ]}
          />
          <CardSection
            icon={sym('shippingbox', 'inventory_2')}
            accent="teal"
            title={`2. Stock at ${outletName('DISTRIBUTOR', distributorId)}`}
            count={lines.length || undefined}>
            <FormField form={fe} name="lines" outline={Object.keys(lineErrors).length === 0}>
              <ProductLinesEditor
                products={products.map((p) => ({
                  id: p.id,
                  name: p.name,
                  subtitle: [p.packSize, p.ptsPaise ? `PTS ${formatRupees(p.ptsPaise)}` : null].filter(Boolean).join(' · ') || undefined,
                }))}
                columns={[{ label: 'Opening stock' }, { label: 'Closing stock' }]}
                lines={lines}
                onChange={changeLines}
                defaults={(id) => [openingDefault(id), '']}
                disabled={busy !== null || readOnly}
                errors={lineErrors}
                footer={(l) => {
                  const s = lineSecondary(l);
                  if (s.rawSecondary === null) {
                    return `Delivered by Done orders: ${s.delivered} unit${s.delivered === 1 ? '' : 's'}${s.pts ? ` · PTS ${formatRupees(s.pts)}` : ' · no PTS price'}`;
                  }
                  if (s.rawSecondary < 0) {
                    return `Delivered ${s.delivered} · Closing is ${Math.abs(s.rawSecondary)} more than opening + delivered`;
                  }
                  return `Delivered ${s.delivered} · Secondary ${s.rawSecondary} unit${s.rawSecondary === 1 ? '' : 's'}${s.pts ? ` (${formatRupees(s.secondaryPaise)} at PTS)` : ''}`;
                }}
              />
            </FormField>
            <ThemedText type="small" themeColor="textSecondary">
              Opening stock pre-fills from last month’s closing when available. Secondary = opening + Done order deliveries − closing.
            </ThemedText>
            {readOnly ? null : (
              <PrimaryButton
                label={online ? 'Save stock count' : 'Save on this phone'}
                loading={busy === 'save'}
                disabled={busy !== null}
                onPress={save}
              />
            )}
          </CardSection>
        </>
      ) : null}

      {waiting.length > 0 ? (
        <CardSection icon={sym('clock.arrow.circlepath', 'sync')} accent="amber" title="Waiting to be sent" count={waiting.length}>
          {waiting.map((r) => {
            const p = r.payload as StockPayload;
            return (
              <ThemedView key={r.clientId} type="backgroundElement" style={styles.card}>
                <ThemedText type="smallBold">{`${outletName(p.outletType, p.outletId)} · ${prettyMonth(p.month)}`}</ThemedText>
                <ThemedText type="small" themeColor={r.status === 'FAILED' ? 'danger' : 'textSecondary'}>
                  {r.status === 'FAILED'
                    ? (r.errorMessage ?? 'Not accepted')
                    : `${p.lines.length} product${p.lines.length === 1 ? '' : 's'} · saved on this phone`}
                </ThemedText>
                {r.status !== 'QUEUED' ? (
                  <View style={styles.row}>
                    {r.status === 'FAILED' ? <PrimaryButton label="Try again" variant="text" loading={busy === 'retry'} onPress={retry} /> : null}
                    {p.outletType === 'DISTRIBUTOR' && p.month === month ? (
                      <PrimaryButton label="Change" variant="text" onPress={() => chooseDistributor(p.outletId)} />
                    ) : null}
                    <PrimaryButton label="Remove" variant="text" onPress={() => remove(r)} />
                  </View>
                ) : null}
              </ThemedView>
            );
          })}
        </CardSection>
      ) : null}
    </View>
  );
}

/** What was typed for a product: which of the two boxes, and the text. The other box follows from the PTS. */
type Typed = { field: 'qty' | 'amount'; text: string };

/**
 * Secondary sales (docs/mobile/secondary-and-targets.md): the units of each product you sold on in the month, or the same as an
 * amount at the product's PTS — one figure, so typing one fills the other. You save a draft, then send the month to your
 * manager. Since 2026-10-14 this is **your own record only**: achievement is counted from your distributors' stock, so what is
 * entered here (and its approval) no longer counts toward targets. It is saved for you, not for an outlet, so it needs a
 * connection. `locked` is a month the server will not take entries for; a month outside the selected financial year is read-only.
 */
export function SecondarySalesPanel({ month, locked }: { month: string; locked: boolean }) {
  const online = useOnline();
  const me = useSessionUser();
  const fy = useFinancialYear();

  const [tick, setTick] = useState(0);
  const sales = useCachedFetch(`emp-secondary:${fy.year}:${month}`, () => getEmployeeSales(me?.id ?? '', month), tick);

  // What has been typed, kept with the month it belongs to, so another month starts clean.
  const [typed, setTyped] = useState<{ month: string; values: Record<string, Typed> }>({ month, values: {} });
  const edits = typed.month === month ? typed.values : {};
  const [busy, setBusy] = useState<'save' | 'send' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const lines = sales.data?.lines ?? [];
  const fe = useFormErrors(lines.map((l) => l.product.id));
  const status = sales.data?.secondaryStatus ?? null;
  const outsideYear = month < fy.firstMonth || month > fy.lastMonth;
  // Pending and approved months are the manager's now; draft, sent-back and untouched months can be changed.
  const frozen = status === 'PENDING' || status === 'APPROVED';
  const readOnly = fy.isPast || outsideYear || locked || frozen;
  const changed = Object.keys(edits).length > 0;

  const setValue = (productId: string, field: Typed['field'], text: string) => {
    setMsg(null);
    fe.clear(productId);
    setTyped({ month, values: { ...edits, [productId]: { field, text: field === 'qty' ? text.replace(/[^0-9]/g, '') : text.replace(/[^0-9.]/g, '') } } });
  };

  /** Units and amount for a line as the screen shows them: what was typed, and the other worked out from the PTS. */
  const figures = (l: (typeof lines)[number]) => {
    const t = edits[l.product.id];
    const ptr = l.ptsPaise;
    if (!t) return { qty: l.secondaryQty === null ? '' : String(l.secondaryQty), amount: l.secondaryAmountPaise === null ? '' : String(l.secondaryAmountPaise / 100) };
    if (t.field === 'qty') {
      const qty = Number(t.text || 0);
      return { qty: t.text, amount: ptr && t.text !== '' ? String((qty * ptr) / 100) : '' };
    }
    const paise = rupeesToPaise(t.text);
    const units = ptr && paise ? Math.round(paise / ptr) : null;
    return { qty: units === null ? '' : String(units), amount: t.text };
  };

  const totalQty = lines.reduce((n, l) => n + Number(figures(l).qty || 0), 0);
  const totalPaise = lines.reduce((n, l) => n + (l.ptsPaise ? Number(figures(l).qty || 0) * l.ptsPaise : 0), 0);

  const save = async () => {
    if (!me) return;
    // Check every typed figure first: a bad amount must be marked, never quietly left out of what is saved.
    const problems: Record<string, string> = {};
    const toSend = lines.flatMap((l): { productId: string; qty?: number; amountPaise?: number }[] => {
      const t = edits[l.product.id];
      if (!t || t.text === '') return [];
      if (t.field === 'qty') return [{ productId: l.product.id, qty: Number(t.text) }];
      const amountPaise = rupeesToPaise(t.text);
      if (amountPaise === null) {
        problems[l.product.id] = 'Enter the amount in rupees, more than zero, with at most two decimals.';
        return [];
      }
      return [{ productId: l.product.id, amountPaise }];
    });
    if (Object.keys(problems).length > 0) {
      setMsg({ tone: 'danger', text: 'Fix the fields marked in red. Nothing was saved.' });
      return fe.fail(problems);
    }
    if (toSend.length === 0) return setMsg({ tone: 'danger', text: 'Enter the units or the amount for at least one product.' });
    fe.clearAll();
    setBusy('save');
    setMsg(null);
    try {
      await saveEmployeeSecondary({ userId: me.id, month, lines: toSend });
      setTyped({ month, values: {} });
      setTick((t) => t + 1);
      setMsg({ tone: 'success', text: `Saved as a draft for ${prettyMonth(month)}. Send it for approval when it is complete.` });
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    setBusy('send');
    setMsg(null);
    try {
      await submitEmployeeSecondary(month);
      setTick((t) => t + 1);
      setMsg({ tone: 'success', text: 'Sent to your manager for approval.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const banner =
    status === 'PENDING'
      ? { accent: 'amber' as const, icon: sym('clock', 'schedule'), title: 'Waiting for approval', text: 'Your manager has this month. It stays as your record once approved.' }
      : status === 'APPROVED'
        ? { accent: 'green' as const, icon: sym('checkmark.circle', 'check_circle'), title: 'Approved', text: 'This month is approved as your record.' }
        : status === 'REJECTED'
          ? { accent: 'red' as const, icon: sym('arrow.uturn.left.circle', 'undo'), title: 'Sent back', text: 'Change what is needed and send it again.' }
          : status === 'DRAFT'
            ? { accent: 'slate' as const, icon: sym('square.and.pencil', 'edit'), title: 'Draft', text: 'Not sent yet. Send it for approval when it is complete.' }
            : null;

  return (
    <View style={styles.stack}>
      <Notice tone="info" title="Your own record">
        Your achievement is counted from your distributors’ stock, so what you enter here is kept as your record and does not change it.
      </Notice>
      {banner ? <StatusBanner {...banner} /> : null}
      {!online ? <Notice tone="warning">Secondary sales are saved on the server. Connect to enter them.</Notice> : null}
      {outsideYear && !locked ? <Notice tone="info">This month is outside the selected financial year, so it can only be read.</Notice> : null}
      {sales.error && online ? <Notice tone="danger">{sales.error}</Notice> : null}
      {sales.stale && sales.fetchedAt && !online ? <Notice tone="info">Showing the last copy from this phone.</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      {sales.loading && !sales.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : lines.length === 0 ? (
        <Notice tone="info">{sales.data ? 'There are no products to enter.' : 'Connect once to load the products.'}</Notice>
      ) : (
        <>
          <SummaryStrip
            items={[
              { label: 'Units sold', value: totalQty, accent: 'green' },
              { label: 'Value at PTS', value: formatRupees(totalPaise), accent: 'teal' },
            ]}
          />
          {lines.map((l) => {
            const f = figures(l);
            const lineStatus = l.secondaryStatus;
            return (
              <InfoCard key={l.product.id}>
                <View style={styles.head}>
                  <View style={styles.grow}>
                    <ThemedText type="smallBold">{l.product.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {`Primary ${l.primaryQty}${l.adjustmentQty !== 0 ? ` (includes Admin's change of ${l.adjustmentQty})` : ''}${l.ptsPaise ? ` · PTS ${formatRupees(l.ptsPaise)}` : ' · no PTS, units only'}`}
                    </ThemedText>
                  </View>
                  {lineStatus ? <Pill text={SECONDARY_STATUS_TEXT[lineStatus]} accent={STATUS_ACCENT[lineStatus]} /> : null}
                </View>
                <FormField form={fe} name={l.product.id} outline={false}>
                  <View style={styles.pair}>
                    <View style={styles.grow}>
                      <TextField
                        label="Units sold"
                        value={f.qty}
                        onChangeText={(t) => setValue(l.product.id, 'qty', t)}
                        keyboardType="number-pad"
                        placeholder="0"
                        editable={busy === null && !readOnly && online}
                      />
                    </View>
                    {l.ptsPaise ? (
                      <View style={styles.grow}>
                        <TextField
                          label="Amount (₹)"
                          value={f.amount}
                          onChangeText={(t) => setValue(l.product.id, 'amount', t)}
                          error={fe.errors[l.product.id]}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          editable={busy === null && !readOnly && online}
                        />
                      </View>
                    ) : null}
                  </View>
                </FormField>
              </InfoCard>
            );
          })}
          <ThemedText type="small" themeColor="textSecondary">
            Units and amount are one figure at the product’s PTS: type either and the other follows (an amount is rounded to whole units).
          </ThemedText>
          {readOnly ? null : (
            <View style={styles.actions}>
              <PrimaryButton label="Save draft" loading={busy === 'save'} disabled={!online || !changed || busy !== null} onPress={save} />
              {(status === 'DRAFT' || status === 'REJECTED') && !changed ? (
                <PrimaryButton label="Send for approval" loading={busy === 'send'} disabled={!online || busy !== null} onPress={send} />
              ) : null}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  grow: { flex: 1, gap: Spacing.one },
  pair: { flexDirection: 'row', gap: Spacing.two },
  actions: { gap: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
