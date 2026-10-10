import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { apiGet } from '@/lib/api';
import { STATUS_LABEL, type ApprovalStatus } from '@/lib/approvals';
import { listStock, type OrderView, type StockRow } from '@/lib/marketing';
import { formatRupees } from '@/lib/money';
import { getRejectionReason, workingTypeLabel, type DailyPlanDetail, type MonthlyPlanDetail } from '@/lib/planning';
import { useSessionUser } from '@/lib/session';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { businessToday, datesInMonth, formatWhen, monthOf, prettyDay, prettyMonth } from '@/offline/day';
import type { ConfigSnapshot, FieldMasterDataSnapshot } from '@/types/sync';

import { Notice } from './notice';
import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const statusText = (status: string) => STATUS_LABEL[status as ApprovalStatus] ?? (status === 'DRAFT' ? 'Not sent' : status);
const bounds = (month: string) => {
  const days = datesInMonth(month);
  return { from: days[0]!, to: days[days.length - 1]! };
};

function Stale({ fetchedAt, stale, error }: { fetchedAt: string | null; stale: boolean; error: string | null }) {
  return (
    <>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {stale && fetchedAt ? <Notice tone="info">{`Showing the copy from ${formatWhen(fetchedAt)}.`}</Notice> : null}
    </>
  );
}

/* ───────────────────────────────── DCR Report ───────────────────────────────── */

type DcrRow = { id: string; reportDate: string; status: string };

/** Your daily call reports for the month, with where each stands. Tap one for its calls, followups and expenses. */
export function DcrReport({ month, year }: { month: string; year: number }) {
  const { from, to } = bounds(month);
  const list = useCachedFetch<DcrRow[]>(`rep-dcr:${year}:${month}`, () => apiGet<DcrRow[]>(`/field-activity/dcr?from=${from}&to=${to}`, { auth: true, fy: true }));
  const rows = [...(list.data ?? [])].sort((a, b) => b.reportDate.localeCompare(a.reportDate));

  return (
    <View style={styles.stack}>
      <Stale {...list} />
      {list.loading && !list.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : rows.length === 0 ? (
        <Notice tone="info">{list.data ? 'No daily reports this month.' : 'Connect once to load your reports.'}</Notice>
      ) : (
        rows.map((r) => (
          <Pressable key={r.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/dcr-report/[id]', params: { id: r.id } })}>
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{prettyDay(r.reportDate)}</ThemedText>
              <ThemedText type="small" themeColor={r.status === 'REJECTED' ? 'danger' : 'textSecondary'}>
                {statusText(r.status)}
              </ThemedText>
            </ThemedView>
          </Pressable>
        ))
      )}
    </View>
  );
}

/* ────────────────────────────────── TP Report ────────────────────────────────── */

/** Your Monthly Plan and daily plans for the month, and where each stands. A rejected one can show its reason. */
export function TpReport({ month, year }: { month: string; year: number }) {
  const { from, to } = bounds(month);
  const monthly = useCachedFetch<MonthlyPlanDetail[]>(`rep-tpm:${year}:${month}`, () => apiGet<MonthlyPlanDetail[]>(`/planning/monthly?from=${month}&to=${month}`, { auth: true, fy: true }));
  const daily = useCachedFetch<DailyPlanDetail[]>(`rep-tpd:${year}:${month}`, () => apiGet<DailyPlanDetail[]>(`/planning/daily?from=${from}&to=${to}`, { auth: true, fy: true }));
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const plan = (monthly.data ?? []).find((m) => m.planMonth === month) ?? null;
  const days = [...(daily.data ?? [])].sort((a, b) => a.planDate.localeCompare(b.planDate));

  const showReason = async (key: string, requestId: string) => {
    try {
      setReasons((r) => ({ ...r, [key]: 'Loading…' }));
      const reason = await getRejectionReason(requestId);
      setReasons((r) => ({ ...r, [key]: reason ?? 'No reason was given.' }));
    } catch {
      setReasons((r) => ({ ...r, [key]: 'Could not load the reason. Check your connection.' }));
    }
  };

  return (
    <View style={styles.stack}>
      <Stale {...daily} />
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{`Monthly Plan · ${prettyMonth(month)}`}</ThemedText>
        <ThemedText type="small" themeColor={plan?.status === 'REJECTED' ? 'danger' : 'textSecondary'}>
          {plan ? statusText(plan.status) : monthly.loading ? 'Loading…' : 'No Monthly Plan for this month.'}
        </ThemedText>
        {plan?.status === 'REJECTED' && plan.approval ? (
          reasons.monthly ? (
            <ThemedText type="small">{`Reason: ${reasons.monthly}`}</ThemedText>
          ) : (
            <PrimaryButton label="See the reason" variant="text" onPress={() => showReason('monthly', plan.approval!.requestId)} />
          )
        ) : null}
      </ThemedView>

      {daily.loading && !daily.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : days.length === 0 ? (
        <Notice tone="info">{daily.data ? 'No daily plans this month.' : 'Connect once to load your plans.'}</Notice>
      ) : (
        days.map((d) => (
          <ThemedView key={d.planDate} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{`${prettyDay(d.planDate)} · ${workingTypeLabel(d.workingType)}`}</ThemedText>
            <ThemedText type="small" themeColor={d.status === 'REJECTED' ? 'danger' : 'textSecondary'}>
              {statusText(d.status)}
            </ThemedText>
            {d.remarks ? <ThemedText type="small">{d.remarks}</ThemedText> : null}
            {d.status === 'REJECTED' && d.approval ? (
              reasons[d.planDate] ? (
                <ThemedText type="small">{`Reason: ${reasons[d.planDate]}`}</ThemedText>
              ) : (
                <PrimaryButton label="See the reason" variant="text" onPress={() => showReason(d.planDate, d.approval!.requestId)} />
              )
            ) : null}
          </ThemedView>
        ))
      )}
    </View>
  );
}

/* ─────────────────────────────── Gift & Sales Report ─────────────────────────────── */

type GiftRow = { id: string; doctorName: string; productName: string; amountPaise: number; completedAt: string | null };

/**
 * What you ordered, counted and gave in the month: orders by status, how many of your outlets have a stock count,
 * the gifts you handed over, and the samples given so far (a running total — the phone only knows what is left of
 * each allocation, not when it was given).
 */
export function SalesReport({ month, year }: { month: string; year: number }) {
  const me = useSessionUser();
  const config = useCachedSource<ConfigSnapshot>('config');
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { from, to } = bounds(month);
  const orders = useCachedFetch<OrderView[]>(`rep-ord:${year}:${month}`, () => apiGet<OrderView[]>(`/sales/orders?from=${from}&to=${to}`, { auth: true, fy: true }));
  const stock = useCachedFetch<StockRow[]>(`rep-stock:${month}`, () => listStock(month));
  const gifts = useCachedFetch<GiftRow[]>('rep-gifts', () => apiGet<GiftRow[]>('/field-activity/doctor-gifts?status=DONE', { auth: true }));
  const zone = config.data?.settings.BUSINESS_TIMEZONE;

  const mine = (orders.data ?? []).filter((o) => !me || o.userId === me.id);
  const by = (s: OrderView['status']) => mine.filter((o) => o.status === s);
  const sum = (list: OrderView[]) => list.reduce((t, o) => t + o.totalAmountPaise, 0);

  const outlets = [...(master.data?.chemists ?? []).map((c) => `CHEMIST:${c.id}`), ...(master.data?.distributors ?? []).map((d) => `DISTRIBUTOR:${d.id}`)];
  const counted = new Set((stock.data ?? []).map((r) => `${r.outlet.type}:${r.outlet.id}`));
  const countedMine = outlets.filter((o) => counted.has(o)).length;

  const giftsThisMonth = (gifts.data ?? []).filter((g) => g.completedAt && monthOf(businessToday(zone, new Date(g.completedAt))) === month);

  const given = new Map<string, number>();
  for (const a of master.data?.sampleAllocations ?? []) given.set(a.productId, (given.get(a.productId) ?? 0) + (a.quantityAllocated - a.quantityRemaining));
  const samples = [...given.entries()].filter(([, qty]) => qty > 0);
  const productName = (id: string) => master.data?.products.find((p) => p.id === id)?.name ?? 'Product';

  return (
    <View style={styles.stack}>
      <Stale fetchedAt={orders.fetchedAt} stale={orders.stale} error={orders.error} />

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Orders</ThemedText>
        {orders.loading && !orders.data ? (
          <ThemedText type="small" themeColor="textSecondary">
            Loading…
          </ThemedText>
        ) : (
          <>
            <ThemedText type="small">{`Placed ${by('PLACED').length} · ${formatRupees(sum(by('PLACED')))}`}</ThemedText>
            <ThemedText type="small">{`Done ${by('DONE').length} · ${formatRupees(sum(by('DONE')))}`}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{`Cancelled ${by('CANCELLED').length}`}</ThemedText>
            <ThemedText type="smallBold">{`Sales (placed and done): ${formatRupees(sum(by('PLACED')) + sum(by('DONE')))}`}</ThemedText>
          </>
        )}
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Stock counts</ThemedText>
        <ThemedText type="small">{stock.data ? `${countedMine} of ${outlets.length} outlets counted for ${prettyMonth(month)}` : stock.loading ? 'Loading…' : 'Connect once to load the counts.'}</ThemedText>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Gifts given</ThemedText>
        {gifts.data ? (
          <>
            <ThemedText type="small">{`${giftsThisMonth.length} gift${giftsThisMonth.length === 1 ? '' : 's'} · ${formatRupees(giftsThisMonth.reduce((t, g) => t + g.amountPaise, 0))}`}</ThemedText>
            {giftsThisMonth.map((g) => (
              <ThemedText key={g.id} type="small" themeColor="textSecondary">{`${g.productName} — ${g.doctorName}`}</ThemedText>
            ))}
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {gifts.loading ? 'Loading…' : 'Connect once to load the gifts.'}
          </ThemedText>
        )}
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Samples given so far</ThemedText>
        {samples.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No samples given yet.
          </ThemedText>
        ) : (
          samples.map(([id, qty]) => <ThemedText key={id} type="small">{`${productName(id)} — ${qty}`}</ThemedText>)
        )}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
});
