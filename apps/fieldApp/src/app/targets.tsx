import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { FormField } from '@/components/form-field';
import { OutletPicker } from '@/components/outlet-picker';
import { PillToggle } from '@/components/pill-toggle';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, InfoCard, Meter, Pill, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useFormErrors } from '@/hooks/use-form-errors';
import { ApiError, NetworkError } from '@/lib/api';
import { useFinancialYear } from '@/lib/financial-year';
import { deleteTarget, setTarget } from '@/lib/marketing';
import { formatRupees, rupeesToPaise } from '@/lib/money';
import { getEmployeeSalesReport } from '@/lib/sales';
import { useSessionUser } from '@/lib/session';
import { useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { monthOf, prettyMonth } from '@/offline/day';
import { useTeam } from '@/offline/team';
import type { FieldMasterDataSnapshot } from '@/types/sync';

/** The set-a-target form's fields top to bottom, so a failed save scrolls to the first one with a problem. */
const FIELD_ORDER = ['who', 'value'];
const errorText =(err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

type Unit = 'AMOUNT' | 'UNITS';
const UNITS: { value: Unit; label: string }[] = [
  { value: 'AMOUNT', label: 'Amount' },
  { value: 'UNITS', label: 'Units' },
];

const percentText = (p: number | null) => (p === null ? 'no target' : `${p}%`);
const accentFor = (p: number | null): Accent => (p === null ? 'slate' : p >= 100 ? 'green' : p >= 50 ? 'amber' : 'red');

/**
 * Targets (docs/mobile/secondary-and-targets.md): what you are meant to sell in a month, per product, as an amount or as units,
 * against your achievement: counted from the stock of the distributors handed to you, valued at PTS (not from what you enter on
 * Secondary Sales). Primary is shown beside it. The figures are your own. A manager can set a target for themselves or someone
 * below them, for one month or a run of months; for a product with a PTS price units and amount are one figure, and a target
 * for all products is an amount only.
 * The server only takes targets inside the current financial year, so setting is off while a past year is selected.
 * Needs a connection: the figures are worked out live.
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
  // The product a new target is for: '' means all products.
  const [productId, setProductId] = useState('');
  const report = useCachedFetch(`emp-report:${fy.year}:${month}`, () => getEmployeeSalesReport(me?.id ?? '', month, month), tick);
  const figures = report.data;

  // Opened from a person's page it starts on "Set a target" for them.
  const preset = useLocalSearchParams<{ userId?: string }>().userId;
  const presetWho = typeof preset === 'string' && preset !== '' ? preset : null;
  const [setting, setSetting] = useState(presetWho !== null && isManager);
  const [who, setWho] = useState<string | null>(presetWho);
  const [unit, setUnit] = useState<Unit>('AMOUNT');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);
  const fe = useFormErrors(FIELD_ORDER);

  const people = [{ id: me?.id ?? '', name: 'Me', subtitle: me?.employeeCode }, ...team.map((c) => ({ id: c.id, name: c.name, subtitle: c.designation ?? c.employeeCode }))];
  const products = master.data?.products ?? [];
  const productOptions = [{ id: '', name: 'All products' }, ...[...products].sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ id: p.id, name: p.name }))];
  // Units only make sense for one product that has a PTS (units × PTS is the amount); anything else is an amount.
  const ptr = products.find((p) => p.id === productId)?.ptsPaise ?? null;
  const canUseUnits = productId !== '' && ptr !== null && ptr > 0;
  const effectiveUnit: Unit = canUseUnits ? unit : 'AMOUNT';
  const unitsEntered = Number(value || 0);
  const worth = effectiveUnit === 'UNITS' && ptr && unitsEntered > 0 ? formatRupees(unitsEntered * ptr) : null;

  const save = async () => {
    const range = until > month ? { toMonth: until } : {};
    const problems: Record<string, string> = {};
    if (!who) problems.who = 'Choose who the target is for.';
    let amountOrUnits: { targetAmountPaise: number } | { targetQty: number } | null = null;
    if (effectiveUnit === 'UNITS') {
      if (!Number.isInteger(unitsEntered) || unitsEntered < 1) problems.value = 'Enter the units as a whole number, at least 1.';
      else amountOrUnits = { targetQty: unitsEntered };
    } else {
      const targetAmountPaise = rupeesToPaise(value);
      if (targetAmountPaise === null) problems.value = 'Enter the amount in rupees, more than zero.';
      else amountOrUnits = { targetAmountPaise };
    }
    if (!who || !amountOrUnits) {
      setMsg({ tone: 'danger', text: 'Fix the fields marked in red.' });
      return fe.fail(problems);
    }
    fe.clearAll();
    setBusy(true);
    try {
      await setTarget({ userId: who, month, ...range, ...amountOrUnits, productId: productId || null });
      setMsg({ tone: 'success', text: 'Target saved.' });
      setSetting(false);
      setValue('');
      setUntil(null);
      setTick((t) => t + 1);
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  // A target is taken off only after a second tap ("Remove" then "Yes, remove"); the server decides who may.
  const [removing, setRemoving] = useState<string | null>(null);
  const remove = async (id: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await deleteTarget(id);
      setMsg({ tone: 'success', text: 'Target removed.' });
      setRemoving(null);
      setTick((t) => t + 1);
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  // Products worth a row: one with a target or a secondary entered (primary alone is shown in the totals).
  const rows = (figures?.products ?? []).filter((p) => p.targetPaise > 0 || p.secondaryQty > 0 || p.primaryQty !== 0);

  return (
    <ScreenShell title="Targets" subtitle="Your targets against what your distributors sold">
      <FyBanner />
      <InfoCard>
        <ThemedText type="smallBold">Month</ThemedText>
        <MonthStepper value={month} onChange={setMonth} min={fy.firstMonth} max={fy.lastMonth} />
      </InfoCard>

      {!online ? <Notice tone="warning">Targets are worked out on the server. Connect to see them.</Notice> : null}
      {report.error && online ? <Notice tone="danger">{report.error}</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {report.loading && !figures ? <Notice tone="info">Loading…</Notice> : null}

      {figures ? (
        <>
          <SummaryStrip
            items={[
              { label: 'Target', value: formatRupees(figures.totals.targetPaise), accent: 'blue' },
              { label: 'Achieved', value: formatRupees(figures.totals.secondaryPaise), accent: 'green' },
              { label: 'Achievement', value: figures.totals.achievementPercent === null ? '—' : `${figures.totals.achievementPercent}%`, accent: accentFor(figures.totals.achievementPercent) },
            ]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {`Achieved is counted from your distributors' stock, at PTS. It shows 0 until their stock is counted. Primary this month: ${formatRupees(figures.totals.primaryPaise)}.${figures.generalTargetPaise > 0 ? ` Includes ${formatRupees(figures.generalTargetPaise)} for all products.` : ''}`}
          </ThemedText>
          {figures.totals.targetPaise === 0 ? <Notice tone="info">No target is set for this month.</Notice> : null}

          {figures.targets.map((t) => (
            <InfoCard key={t.id}>
              <View style={styles.head}>
                <View style={styles.grow}>
                  <ThemedText type="smallBold">{t.product?.name ?? 'All products'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t.fromMonth === t.toMonth ? prettyMonth(t.fromMonth) : `${prettyMonth(t.fromMonth)} to ${prettyMonth(t.toMonth)}`}
                  </ThemedText>
                </View>
                <Pill text={percentText(t.achievementPercent)} accent={accentFor(t.achievementPercent)} />
              </View>
              <Meter value={t.achievedPaise} total={t.amountPaise} accent={accentFor(t.achievementPercent)} />
              <ThemedText type="small">{`${formatRupees(t.achievedPaise)} of ${formatRupees(t.amountPaise)}`}</ThemedText>
              {t.targetQty !== null ? (
                <>
                  <Meter value={t.achievedQty} total={t.targetQty} accent={accentFor(t.achievementQtyPercent)} />
                  <ThemedText type="small">{`${t.achievedQty} of ${t.targetQty} units · ${percentText(t.achievementQtyPercent)}`}</ThemedText>
                </>
              ) : null}
              {isManager && online && !fy.isPast ? (
                removing === t.id ? (
                  <View style={styles.head}>
                    <PrimaryButton label="Yes, remove" loading={busy} onPress={() => remove(t.id)} />
                    <PrimaryButton label="Keep it" variant="text" disabled={busy} onPress={() => setRemoving(null)} />
                  </View>
                ) : (
                  <PrimaryButton label="Remove this target" variant="text" disabled={busy} onPress={() => setRemoving(t.id)} />
                )
              ) : null}
            </InfoCard>
          ))}

          {rows.length > 0 ? <ThemedText type="smallBold">By product</ThemedText> : null}
          {rows.map((p) => (
            <InfoCard key={p.product.id}>
              <ThemedText type="smallBold">{p.product.name}</ThemedText>
              <ThemedText type="small">{`Target ${formatRupees(p.targetPaise)} · Achieved ${p.secondaryQty} units, ${formatRupees(p.secondaryPaise)} · ${percentText(p.achievementPercent)}`}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{`Primary ${p.primaryQty} units, ${formatRupees(p.primaryPaise)}`}</ThemedText>
              {p.flags.includes('NO_PTS') ? <ThemedText type="small" themeColor="warning">This product has no PTS price, so its achievement is counted in units only.</ThemedText> : null}
            </InfoCard>
          ))}
          <PrimaryButton label="Enter secondary sales" variant="text" onPress={() => router.push('/secondary-sales')} />
        </>
      ) : null}

      {isManager && online && !fy.isPast ? (
        setting ? (
          <CardSection
            icon={sym('target', 'track_changes')}
            accent="red"
            title={until > month ? `Set a target for ${prettyMonth(month)} to ${prettyMonth(until)}` : `Set a target for ${prettyMonth(month)}`}>
            <OutletPicker label="Product" options={productOptions} value={productId} onChange={setProductId} disabled={busy} emptyText="No products yet." />
            <FormField form={fe} name="who">
              <OutletPicker
                label="For"
                options={people}
                value={who}
                onChange={(id) => {
                  setWho(id);
                  fe.clear('who');
                }}
                disabled={busy}
                emptyText="No one to choose."
              />
            </FormField>
            <ThemedText type="small" themeColor="textSecondary">
              Until (the same month means just that month):
            </ThemedText>
            <MonthStepper value={until} onChange={setUntil} min={month} max={fy.lastMonth} />
            {canUseUnits ? <PillToggle options={UNITS} value={effectiveUnit} onChange={setUnit} disabled={busy} /> : null}
            <FormField form={fe} name="value" outline={false}>
              <TextField
                label={effectiveUnit === 'UNITS' ? 'Target (units)' : 'Target (₹)'}
                value={value}
                onChangeText={(t) => {
                  setValue(effectiveUnit === 'UNITS' ? t.replace(/[^0-9]/g, '') : t.replace(/[^0-9.]/g, ''));
                  fe.clear('value');
                }}
                error={fe.errors.value}
                keyboardType={effectiveUnit === 'UNITS' ? 'number-pad' : 'decimal-pad'}
                placeholder={effectiveUnit === 'UNITS' ? '0' : '0.00'}
                editable={!busy}
              />
            </FormField>
            {worth ? <ThemedText type="small" themeColor="textSecondary">{`That is ${worth} at the product's PTS price.`}</ThemedText> : null}
            {productId === '' ? <ThemedText type="small" themeColor="textSecondary">A target for all products is an amount only.</ThemedText> : null}
            <PrimaryButton label="Save target" loading={busy} onPress={save} />
            <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => (setSetting(false), setUntil(null))} />
          </CardSection>
        ) : (
          <PrimaryButton label="Set a target" onPress={() => (setMsg(null), setSetting(true))} />
        )
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: Spacing.one },
});
