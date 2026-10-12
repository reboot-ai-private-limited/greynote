import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { FyBanner } from '@/components/fy-banner';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { ApiError, NetworkError } from '@/lib/api';
import { setTarget } from '@/lib/marketing';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { useFinancialYear } from '@/lib/financial-year';
import { getEmployeeSalesReport } from '@/lib/sales';
import { useSessionUser } from '@/lib/session';
import { useOnline } from '@/offline';
import { useTeam } from '@/offline/team';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { MonthStepper } from '@/components/month-stepper';
import { monthOf, prettyMonth } from '@/offline/day';
import type { FieldMasterDataSnapshot } from '@/types/sync';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Targets (PRD §6.2): what you are meant to sell in a month, per product, against your achievement, which is
 * the secondary you entered (Secondary Sales); primary is shown beside it. The figures are your own — a
 * team roll-up is not here yet. A manager can set a target for themselves or someone below them, for one
 * month or a run of months. The server only takes targets
 * inside the current financial year, so the months here stay inside the selected year and setting is
 * off while a past year is selected. Needs a connection — the figures are worked out live.
 */
export default function TargetsScreen() {
  const online = useOnline();
  const me = useSessionUser();
  const fy = useFinancialYear();
  const { isManager } = useCurrentUser();
  const { team } = useTeam();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');

  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > fy.lastMonth ? fy.lastMonth : m);
  const [picked, setMonth] = useState<string | null>(null);
  const month = clamp(picked ?? (fy.isPast ? fy.lastMonth : monthOf(fy.today)));
  // The last month of a target run; never before the first month, never past the end of the year.
  const [untilPicked, setUntil] = useState<string | null>(null);
  const until = clamp(untilPicked && untilPicked > month ? untilPicked : month);
  const [tick, setTick] = useState(0);
  // The product a new target is for (PRD §6.2): '' means all products.
  const [productId, setProductId] = useState('');
  // Targets are per product and achievement is the secondary you entered, so the figures come from the sales report.
  const report = useCachedFetch(`emp-report:${fy.year}:${month}`, () => getEmployeeSalesReport(me?.id ?? '', month, month), tick);
  const figures = report.data;

  const [setting, setSetting] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const people = [{ id: me?.id ?? '', name: 'Me', subtitle: me?.employeeCode }, ...team.map((c) => ({ id: c.id, name: c.name, subtitle: c.designation ?? c.employeeCode }))];

  const save = async () => {
    const targetAmountPaise = rupeesToPaise(amount);
    if (!who) return setMsg({ tone: 'danger', text: 'Choose who the target is for.' });
    if (targetAmountPaise === null) return setMsg({ tone: 'danger', text: 'Enter the amount in rupees, more than zero.' });
    setBusy(true);
    try {
      await setTarget({ userId: who, month, ...(until > month ? { toMonth: until } : {}), targetAmountPaise, productId: productId || null });
      setMsg({ tone: 'success', text: 'Target saved.' });
      setSetting(false);
      setAmount('');
      setUntil(null);
      setTick((t) => t + 1);
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const productOptions = [{ id: '', name: 'All products' }, ...(master.data?.products ?? []).map((p) => ({ id: p.id, name: p.name }))];

  const percentText = (p: number | null) => (p === null ? 'no target' : `${p}%`);
  // Products worth a row: one with a target or a secondary entered (primary alone is shown in the totals).
  const rows = (figures?.products ?? []).filter((p) => p.targetPaise > 0 || p.secondaryQty > 0 || p.primaryQty !== 0);

  return (
    <ScreenShell title="Targets">
      <FyBanner />
      <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={fy.lastMonth} />

      {!online ? <Notice tone="warning">Targets are worked out on the server. Connect to see them.</Notice> : null}
      {report.error && online ? <Notice tone="danger">{report.error}</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {report.loading && !figures ? <Notice tone="info">Loading…</Notice> : null}

      {figures ? (
        <>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              Your target for the month
            </ThemedText>
            <ThemedText type="subtitle">{formatRupees(figures.totals.targetPaise)}</ThemedText>
            <ThemedText type="small">{`Achieved (secondary) ${formatRupees(figures.totals.secondaryPaise)} · ${percentText(figures.totals.achievementPercent)}`}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{`Primary ${formatRupees(figures.totals.primaryPaise)}`}</ThemedText>
            {figures.totals.targetPaise === 0 ? <ThemedText type="small" themeColor="textSecondary">No target is set for this month.</ThemedText> : null}
            {figures.generalTargetPaise > 0 ? <ThemedText type="small" themeColor="textSecondary">{`Includes ${formatRupees(figures.generalTargetPaise)} for all products.`}</ThemedText> : null}
          </ThemedView>

          {rows.map((p) => (
            <ThemedView key={p.product.id} type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{p.product.name}</ThemedText>
              <ThemedText type="small">{`Target ${formatRupees(p.targetPaise)} · Secondary ${p.secondaryQty} units, ${formatRupees(p.secondaryPaise)} · ${percentText(p.achievementPercent)}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{`Primary ${p.primaryQty} units, ${formatRupees(p.primaryPaise)}`}</ThemedText>
              {p.flags.includes('NO_PTR') ? <ThemedText type="small" themeColor="warning">This product has no retail price, so its secondary is counted in units only.</ThemedText> : null}
            </ThemedView>
          ))}
          <PrimaryButton label="Enter secondary sales" variant="text" onPress={() => router.push('/secondary-sales')} />
        </>
      ) : null}

      {isManager && online && !fy.isPast ? (
        setting ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{until > month ? `Set a target for ${prettyMonth(month)} to ${prettyMonth(until)}` : `Set a target for ${prettyMonth(month)}`}</ThemedText>
            <OutletPicker label="Product" options={productOptions} value={productId} onChange={setProductId} disabled={busy} emptyText="No products yet." />
            <OutletPicker label="For" options={people} value={who} onChange={setWho} disabled={busy} emptyText="No one to choose." />
            <ThemedText type="small" themeColor="textSecondary">
              Until (the same month means just that month):
            </ThemedText>
            <MonthStepper value={until} onChange={setUntil} min={month} max={fy.lastMonth} />
            <TextField label="Target (₹)" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0.00" editable={!busy} />
            <PrimaryButton label="Save target" loading={busy} onPress={save} />
            <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => (setSetting(false), setUntil(null))} />
          </ThemedView>
        ) : (
          <PrimaryButton label="Set a target" onPress={() => (setMsg(null), setSetting(true))} />
        )
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
});
