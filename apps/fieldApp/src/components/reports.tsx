import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing, type Accent } from '@/constants/theme';
import { apiGet } from '@/lib/api';
import { STATUS_LABEL, type ApprovalStatus } from '@/lib/approvals';
import { listStock, type OrderView, type StockRow } from '@/lib/marketing';
import { formatRupees } from '@/lib/money';
import { getMyDcrCoverage, getMyDcrYear, getMyTaDaDays, getMyTaDaYear, type TaDaDay } from '@/lib/my-reports';
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
import { InfoCard, Pill, RowCard, SummaryStrip, sym } from './ui-cards';

const statusText = (status: string) => STATUS_LABEL[status as ApprovalStatus] ?? (status === 'DRAFT' ? 'Not sent' : status);
const REPORT_ACCENT: Record<string, Accent> = { APPROVED: 'green', SUBMITTED: 'amber', MANAGER_APPROVED: 'blue', REJECTED: 'red', DRAFT: 'slate', WITHDRAWN: 'slate', REOPENED: 'slate' };
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
  // The month's call figures and the doctors not yet visited: the server counts them (docs/mobile/reports.md rule 11).
  const year_ = useCachedFetch(`rep-dcr-year:${year}`, () => getMyDcrYear(year));
  const coverage = useCachedFetch(`rep-dcr-cover:${year}:${month}`, () => getMyDcrCoverage(month));
  const figures = year_.data?.months.find((m) => m.month === month) ?? null;

  return (
    <View style={styles.stack}>
      <Stale {...list} />
      {figures && figures.reportedDays > 0 ? (
        <>
          <SummaryStrip
            items={[
              { label: 'Reported days', value: figures.reportedDays, accent: 'blue' },
              { label: 'Calls', value: figures.calls, accent: 'green' },
              { label: 'Follow-ups', value: figures.followups, accent: 'purple' },
            ]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {`${figures.doctorCalls} doctor and ${figures.chemistCalls} chemist calls${figures.callsPerDay !== null ? `, ${figures.callsPerDay} a day` : ''}${figures.lateDays ? ` · ${figures.lateDays} sent late` : ''}${figures.unconfirmed ? ` · ${figures.unconfirmed} location not confirmed` : ''}${figures.notInPlan ? ` · ${figures.notInPlan} not in plan` : ''}`}
          </ThemedText>
        </>
      ) : null}
      {coverage.data ? (
        <InfoCard>
          <ThemedText type="smallBold">{`Doctors visited: ${coverage.data.visited} of ${coverage.data.assigned}`}</ThemedText>
          {coverage.data.notVisited.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {coverage.data.assigned === 0 ? 'No doctors are assigned to you.' : 'You have called on every doctor assigned to you.'}
            </ThemedText>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Not called on yet this month:
              </ThemedText>
              {coverage.data.notVisited.slice(0, 10).map((d) => (
                <ThemedText key={d.id} type="small">{`${d.name} · ${d.specialty}`}</ThemedText>
              ))}
              {coverage.data.notVisited.length > 10 ? (
                <ThemedText type="small" themeColor="textSecondary">{`…and ${coverage.data.notVisited.length - 10} more`}</ThemedText>
              ) : null}
            </>
          )}
        </InfoCard>
      ) : null}
      {list.loading && !list.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : rows.length === 0 ? (
        <Notice tone="info">{list.data ? 'No daily reports this month.' : 'Connect once to load your reports.'}</Notice>
      ) : (
        rows.map((r) => (
          <RowCard
            key={r.id}
            icon={sym('doc.text', 'description')}
            accent={REPORT_ACCENT[r.status] ?? 'slate'}
            title={prettyDay(r.reportDate)}
            subtitle="Tap for its calls, followups and expenses"
            right={<Pill text={statusText(r.status)} accent={REPORT_ACCENT[r.status] ?? 'slate'} />}
            onPress={() => router.push({ pathname: '/dcr-report/[id]', params: { id: r.id } })}
          />
        ))
      )}
    </View>
  );
}

/* ───────────────────────────────── TA / DA Report ───────────────────────────────── */

const EXPENSE_TYPE: Record<TaDaDay['type'], string> = { TA: 'TA', DA: 'DA', TRAVEL: 'Travel', MEAL: 'Meal', MISC: 'Other', OTHER: 'Other' };

/**
 * Your TA, DA and claims the company has accepted: the month's totals with what is paid and unpaid, then each day. The server
 * adds it all up; the phone only shows it.
 */
export function TaDaReport({ month, year }: { month: string; year: number }) {
  const yearly = useCachedFetch(`rep-tada-year:${year}`, () => getMyTaDaYear(year));
  const days = useCachedFetch(`rep-tada-days:${year}:${month}`, () => getMyTaDaDays(month));
  const figures = yearly.data?.months.find((m) => m.month === month) ?? null;
  const rows = days.data?.rows ?? [];

  return (
    <View style={styles.stack}>
      <Stale {...days} />
      {figures ? (
        <>
          <SummaryStrip
            items={[
              { label: 'TA', value: formatRupees(figures.taPaise), accent: 'blue' },
              { label: 'DA', value: formatRupees(figures.daPaise), accent: 'green' },
              { label: 'Total', value: formatRupees(figures.totalPaise), accent: 'purple' },
            ]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {`${figures.reimbursementPaise > 0 ? `Claims ${formatRupees(figures.reimbursementPaise)} · ` : ''}Paid ${formatRupees(figures.paidPaise)} · Not paid yet ${formatRupees(figures.unpaidPaise)}`}
          </ThemedText>
          {figures.flaggedRows > 0 ? <Notice tone="warning">{`${figures.flaggedRows} travel amount${figures.flaggedRows === 1 ? '' : 's'} could not be worked out from the route distance and may be low. Ask Admin.`}</Notice> : null}
        </>
      ) : null}
      {yearly.data ? (
        <ThemedText type="small" themeColor="textSecondary">{`Whole year: ${formatRupees(yearly.data.totals.totalPaise)} (paid ${formatRupees(yearly.data.totals.paidPaise)})`}</ThemedText>
      ) : null}
      {days.loading && !days.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : rows.length === 0 ? (
        <Notice tone="info">{days.data ? 'No accepted expenses this month. TA and DA appear once a daily report is approved.' : 'Connect once to load your expenses.'}</Notice>
      ) : (
        rows.map((r, i) => (
          <RowCard
            key={`${r.date}-${r.type}-${i}`}
            icon={sym('indianrupeesign.circle', 'payments')}
            accent={r.status === 'PAID' ? 'green' : 'amber'}
            title={`${prettyDay(r.date)} · ${EXPENSE_TYPE[r.type]}`}
            subtitle={[r.route?.name, r.remarks].filter(Boolean).join(' · ') || (r.source === 'AUTO' ? 'Worked out by the server' : 'Entered by you')}
            right={
              <View>
                <ThemedText type="smallBold">{formatRupees(r.amountPaise)}</ThemedText>
                <Pill text={r.status === 'PAID' ? 'Paid' : 'Not paid'} accent={r.status === 'PAID' ? 'green' : 'amber'} />
              </View>
            }
          />
        ))
      )}
      {days.data?.truncated ? <Notice tone="info">The list is long and may be cut short. The totals above are complete.</Notice> : null}
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
        <ThemedText type="smallBold">{`Tour Plan · ${prettyMonth(month)}`}</ThemedText>
        <ThemedText type="small" themeColor={plan?.status === 'REJECTED' ? 'danger' : 'textSecondary'}>
          {plan ? statusText(plan.status) : monthly.loading ? 'Loading…' : 'No Tour Plan for this month.'}
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

  const giftsThisMonth = (gifts.data ?? []).filter((g) => g.completedAt && monthOf(businessToday(zone, new Date(g.completedAt), config.data?.settings.DAY_START_TIME)) === month);

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
