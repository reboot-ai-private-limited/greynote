import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { SecondaryFiles } from '@/components/secondary-files';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { InfoCard, Pill, StatusBanner, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';

import { useTheme } from '@/hooks/use-theme';
import { withdrawRequest } from '@/lib/approvals';
import { ApiError, NetworkError } from '@/lib/api';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { getRejectionReason } from '@/lib/planning';
import { useSessionUser } from '@/lib/session';
import {
  STOCK_COUNT_STATUS_ACCENT,
  STOCK_COUNT_STATUS_TEXT,
  adjustedNote,
  closingOf,
  findMyStockCountRequest,
  getStockCounts,
  isHeld,
  saveStockCounts,
  submitStockCounts,
  type SecondaryStockInput,
  type SecondaryStockLine,
  type StockCountDistributor,
  type StockCountsMonth,
} from '@/lib/stock-counts';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf, prettyMonth } from '@/offline/day';

/** What the MR has typed for one product of one distributor; strings so a half-typed number is not lost. */
type Edit = { o: string; p: string; i: string; /** Removed from the screen: sent as zeros. */ gone?: boolean };
const keyOf = (distributorId: string, productId: string) => `${distributorId}:${productId}`;

const toQty = (s: string) => (s.trim() === '' ? 0 : /^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);

/** The server's reasons in the phone's words; anything else shows the server's own message. */
const errorText = (err: unknown) => {
  if (err instanceof ApiError) {
    switch (err.data?.code) {
      case 'ATTACHMENT_REQUIRED':
        return 'Attach at least one proof file before submitting.';
      case 'SECONDARY_NOTHING_TO_SEND':
        return 'There is nothing to send for this month. Save some figures first.';
      case 'SECONDARY_LOCKED':
        return 'This month is with your manager or approved, so it can’t be changed. Wait for the decision, or ask for it to be sent back.';
      case 'OUTLET_NOT_YOURS':
        return 'That distributor is not assigned to you.';
      case 'MR_ONLY':
        return 'Only a medical representative enters secondary sales.';
      case 'MONTH_CLOSED':
        return 'This month is closed. Ask Admin to reopen it or allow a late entry.';
      case 'MONTH_NOT_STARTED':
        return 'This month has not started yet.';
      case 'INVALID_PAYLOAD':
        return 'Secondary can’t be more than opening plus primary.';
    }
  }
  return err instanceof ApiError || err instanceof NetworkError || err instanceof Error ? err.message : 'Something went wrong. Please try again.';
};

/**
 * Secondary Sales for an MR (docs/mobile/secondary-and-targets.md, 2026-11-05): per assigned distributor and product, Opening and
 * Primary (both prefilled by the server and editable), Secondary (typed) and Closing (shown). Save draft, attach at least one proof
 * file, then Submit the month to the manager. Only approved rows count. Online only.
 */
export function SecondaryStockScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const me = useSessionUser();
  const theme = useTheme();
  const userId = me?.id ?? '';

  const lastMonth = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > lastMonth ? lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? lastMonth);

  const counts = useCachedFetch<StockCountsMonth>(`secondary-stock:${fy.year}:${userId}:${month}`, () => getStockCounts(userId, month));
  const data = counts.data?.month === month ? counts.data : null;

  const [distributorId, setDistributorId] = useState<string | null>(null);
  const [edits, setEdits] = useState<{ month: string; rows: Record<string, Edit> }>({ month, rows: {} });
  const [busy, setBusy] = useState<'save' | 'submit' | 'withdraw' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'info'; text: string } | null>(null);
  const rows = edits.month === month ? edits.rows : {};

  const distributors = data?.distributors ?? [];
  const current: StockCountDistributor | null = distributors.find((d) => d.distributorId === distributorId) ?? null;

  // Which products are on screen for each distributor: the ones already saved with figures, plus the ones added from the dropdown.
  const [added, setAdded] = useState<{ month: string; ids: Record<string, string[]> }>({ month, ids: {} });
  const addedIds = added.month === month ? added.ids : {};
  const isVisible = (d: StockCountDistributor, l: SecondaryStockLine) =>
    (addedIds[d.distributorId] ?? []).includes(l.product.id) || (l.saved && (l.openingQty > 0 || l.primaryQty > 0 || l.issuedQty > 0) && !rows[keyOf(d.distributorId, l.product.id)]?.gone);
  const addProduct = (d: StockCountDistributor, productId: string) => {
    const k = keyOf(d.distributorId, productId);
    if (rows[k]?.gone) {
      const { [k]: _gone, ...rest } = rows;
      setEdits({ month, rows: rest });
    }
    setAdded({ month, ids: { ...addedIds, [d.distributorId]: [...(addedIds[d.distributorId] ?? []), productId] } });
  };
  const removeProduct = (d: StockCountDistributor, l: SecondaryStockLine) => {
    const k = keyOf(d.distributorId, l.product.id);
    setAdded({ month, ids: { ...addedIds, [d.distributorId]: (addedIds[d.distributorId] ?? []).filter((id) => id !== l.product.id) } });
    // A row that was saved is sent back as zeros (the server keeps no "deleted" row); one never saved is just dropped.
    if (l.saved) setEdits({ month, rows: { ...rows, [k]: { o: '0', p: '0', i: '0', gone: true } } });
    else {
      const { [k]: _drop, ...rest } = rows;
      setEdits({ month, rows: rest });
    }
    setMsg(null);
  };
  const held = data ? isHeld(data.status) || distributors.some((d) => isHeld(d.status)) : false;
  const rejected = data?.status === 'REJECTED';
  const readOnly = held || fy.isPast;

  const reason = useCachedFetch<string | null>(rejected ? `secondary-stock-reason:${month}` : 'secondary-stock-reason:none', async () => {
    if (!rejected || !me) return null;
    const request = await findMyStockCountRequest(me.id, month);
    return request ? getRejectionReason(request.id) : null;
  });

  /** The numbers on screen for a line: what was typed, else what the server holds (or suggests). */
  const valuesOf = (d: StockCountDistributor, l: SecondaryStockLine) => {
    const e = rows[keyOf(d.distributorId, l.product.id)];
    const o = e ? toQty(e.o) : l.openingQty;
    const p = e ? toQty(e.p) : l.primaryQty;
    const i = e ? toQty(e.i) : l.issuedQty;
    return { o, p, i, closing: closingOf(o, p, i), bad: [o, p, i].some(Number.isNaN) };
  };
  const setField = (d: StockCountDistributor, l: SecondaryStockLine, field: 'o' | 'p' | 'i', text: string) => {
    const k = keyOf(d.distributorId, l.product.id);
    const base: Edit = rows[k] ?? { o: String(l.openingQty), p: String(l.primaryQty), i: String(l.issuedQty) };
    setEdits({ month, rows: { ...rows, [k]: { ...base, [field]: text.replace(/[^0-9]/g, '') } } });
    setMsg(null);
  };

  const editedInputs = (): SecondaryStockInput[] =>
    distributors.flatMap((d) =>
      d.lines.flatMap((l) => {
        const e = rows[keyOf(d.distributorId, l.product.id)];
        if (!e) return [];
        const v = valuesOf(d, l);
        return [{ distributorId: d.distributorId, productId: l.product.id, openingQty: v.o, primaryQty: v.p, issuedQty: v.i }];
      }),
    );
  const problem = (list: SecondaryStockInput[]) => {
    for (const l of list) {
      if ([l.openingQty, l.primaryQty, l.issuedQty].some(Number.isNaN)) return 'Enter whole numbers only.';
      if (l.issuedQty > l.openingQty + l.primaryQty) return 'Secondary can’t be more than opening plus primary. Fix the red rows.';
    }
    return null;
  };

  const save = async (): Promise<boolean> => {
    const list = editedInputs();
    const bad = problem(list);
    if (bad) {
      setMsg({ tone: 'danger', text: bad });
      return false;
    }
    if (list.length === 0) return true;
    setBusy('save');
    try {
      await saveStockCounts(month, list);
      setEdits({ month, rows: {} });
      setAdded({ month, ids: {} });
      counts.reload();
      setMsg({ tone: 'success', text: 'Draft saved.' });
      return true;
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!data) return;
    if (data.attachmentCount < 1) return setMsg({ tone: 'danger', text: 'Attach at least one proof file before submitting.' });
    if (!(await save())) return;
    setBusy('submit');
    try {
      const r = await submitStockCounts(month);
      setMsg({ tone: 'success', text: `Sent to your manager (${r.sent} row${r.sent === 1 ? '' : 's'}).` });
      counts.reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async () => {
    if (!me) return;
    setBusy('withdraw');
    try {
      const request = await findMyStockCountRequest(me.id, month);
      if (!request) throw new Error('The request was not found.');
      await withdrawRequest(request.id);
      setMsg({ tone: 'info', text: 'Withdrawn. You can change the month and send it again.' });
      counts.reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const productCards = (d: StockCountDistributor) =>
    d.lines.filter((l) => isVisible(d, l)).map((l) => {
      const v = valuesOf(d, l);
      const k = keyOf(d.distributorId, l.product.id);
      const e = rows[k];
      const typed = (field: 'o' | 'p' | 'i', fallback: number) => (e ? e[field] : String(fallback));
      const worth = l.ptsPaise !== null && !v.bad && v.i >= 0 ? formatRupees(v.i * l.ptsPaise) : null;
      return (
        <InfoCard key={k}>
          <View style={styles.between}>
            <ThemedText type="smallBold" style={styles.grow}>{l.product.name}</ThemedText>
            {!readOnly ? <PrimaryButton label="Remove" variant="text" disabled={busy !== null} onPress={() => removeProduct(d, l)} /> : null}
          </View>
          <View style={styles.fields}>
            <View style={styles.field}>
              <TextField label="Opening" keyboardType="number-pad" editable={!readOnly} value={typed('o', l.openingQty)} onChangeText={(t) => setField(d, l, 'o', t)} />
            </View>
            <View style={styles.field}>
              <TextField label="Primary" keyboardType="number-pad" editable={!readOnly} value={typed('p', l.primaryQty)} onChangeText={(t) => setField(d, l, 'p', t)} />
            </View>
            <View style={styles.field}>
              <TextField label="Secondary" keyboardType="number-pad" editable={!readOnly} value={typed('i', l.issuedQty)} onChangeText={(t) => setField(d, l, 'i', t)} error={v.closing < 0 ? ' ' : undefined} />
            </View>
          </View>
          <ThemedText type="small" style={{ color: v.closing < 0 ? theme.danger : theme.textSecondary }}>
            {v.bad ? 'Closing —' : `Closing stock: ${v.closing} units${v.closing < 0 ? ' (below zero)' : ''}`}
          </ThemedText>
          {adjustedNote(l) ? <ThemedText type="small" themeColor="warning">{adjustedNote(l)}</ThemedText> : null}
          {/* The rupee figure is the Secondary units at PTS, not the closing stock. */}
          <View style={[styles.value, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold" style={styles.grow}>Secondary sales value</ThemedText>
            <ThemedText type="smallBold" themeColor="primary">
              {l.ptsPaise === null ? 'No PTS set' : worth ?? '—'}
            </ThemedText>
          </View>
          {l.ptsPaise !== null && !v.bad ? (
            <ThemedText type="small" themeColor="textSecondary">{`${v.i} secondary units × ${formatRupees(l.ptsPaise)} PTS`}</ThemedText>
          ) : null}
        </InfoCard>
      );
    });

  const totalsFor = (d: StockCountDistributor) => {
    let units = 0;
    let paise = 0;
    for (const l of d.lines.filter((x) => isVisible(d, x))) {
      const v = valuesOf(d, l);
      if (v.bad) continue;
      units += v.i;
      if (l.ptsPaise !== null) paise += v.i * l.ptsPaise;
    }
    return { units, paise };
  };

  // Choose the distributor from a searchable dropdown, then add each medicine from a second one; a medicine can be removed again.
  const distributorPicker = (
    <OutletPicker
      label="Distributor"
      searchable
      searchPlaceholder="Search distributor"
      emptyText="No distributor is assigned to you."
      options={distributors.map((d) => ({ id: d.distributorId, name: d.name, subtitle: STOCK_COUNT_STATUS_TEXT[d.status] }))}
      value={current?.distributorId ?? null}
      onChange={setDistributorId}
    />
  );

  const detail = current ? (
    <View style={styles.stack}>
      {productCards(current)}
      {!readOnly ? (
        <OutletPicker
          label="Add medicine"
          searchable
          searchPlaceholder="Search medicine"
          emptyText="Every medicine is already added."
          options={current.lines.filter((l) => !isVisible(current, l)).map((l) => ({ id: l.product.id, name: l.product.name, subtitle: l.product.sku }))}
          value={null}
          onChange={(id) => addProduct(current, id)}
        />
      ) : null}
      {current.lines.some((l) => isVisible(current, l)) ? (
        <ThemedText type="smallBold">{`Total secondary ${totalsFor(current).units} units · ${formatRupees(totalsFor(current).paise)}`}</ThemedText>
      ) : (
        <Notice tone="info">No medicine added yet. Choose one from “Add medicine”.</Notice>
      )}
    </View>
  ) : null;

  const nothing = data && distributors.length === 0;
  const dirty = Object.keys(rows).length > 0;
  const needsFile = data !== null && data.attachmentCount < 1;

  const footer =
    data && !readOnly && !nothing ? (
      <View style={styles.footer}>
        <View style={styles.grow}>
          <PrimaryButton
            label="Save draft"
            variant="text"
            style={[styles.saveDraft, { borderColor: theme.primary }]}
            loading={busy === 'save'} disabled={!online || busy !== null || !dirty} onPress={() => void save()} />
        </View>
        <View style={styles.grow}>
          <PrimaryButton label="Submit" loading={busy === 'submit'} disabled={!online || busy !== null || needsFile} onPress={() => void submit()} />
        </View>
      </View>
    ) : null;

  return (
    <ScreenShell title="Secondary Sales" subtitle="Units by distributor and product" wide onRefresh={counts.reload} refreshing={counts.refreshing} footer={footer}>
      <FyBanner />
      <InfoCard>
        <ThemedText type="smallBold">Month</ThemedText>
        <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={lastMonth} />
      </InfoCard>
      {!online ? <Notice tone="info">You’re offline. Secondary sales are saved and sent online only.</Notice> : null}
      {counts.error && online ? <Notice tone="danger">{counts.error}</Notice> : null}
      {data ? (
        <View style={styles.between}>
          <ThemedText type="small" themeColor="textSecondary">{`${prettyMonth(month)}`}</ThemedText>
          <Pill text={STOCK_COUNT_STATUS_TEXT[data.status]} accent={STOCK_COUNT_STATUS_ACCENT[data.status]} />
        </View>
      ) : null}
      {data?.status === 'PENDING' ? (
        <StatusBanner accent="amber" icon={sym('clock', 'schedule')} title="Waiting for your manager" text="You can’t change the month while it is waiting. Withdraw it to edit." />
      ) : null}
      {data?.status === 'APPROVED' ? <StatusBanner accent="green" icon={sym('checkmark.circle', 'check_circle')} title="Approved" text="This month counts toward your achievement." /> : null}
      {rejected ? <Notice tone="danger" title="Sent back by your manager">{reason.data ?? 'Fix the figures and send the month again.'}</Notice> : null}
      {held && data?.status === 'PENDING' ? (
        <PrimaryButton label="Withdraw" variant="text" loading={busy === 'withdraw'} disabled={!online || busy !== null} onPress={() => void withdraw()} />
      ) : null}
      {counts.loading && !data ? <Notice tone="info">Loading…</Notice> : null}
      {nothing ? <Notice tone="info">No distributor is assigned to you, so there is nothing to enter.</Notice> : null}

      {data && !nothing ? distributorPicker : null}
      {data && !nothing ? detail : null}

      {data && !nothing ? (
        <SecondaryFiles month={month} files={data.attachments} canEdit={!readOnly && !fy.isPast} online={online} onChanged={counts.reload} />
      ) : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  grow: { flex: 1 },
  fields: { flexDirection: 'row', gap: Spacing.two },
  field: { flex: 1 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  footer: { flexDirection: 'row', gap: Spacing.three },
  value: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: Spacing.two },
  saveDraft: { borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.three, alignItems: 'center', justifyContent: 'center' },
});
