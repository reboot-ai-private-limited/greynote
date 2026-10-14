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
import { getEmployeeSalesReport, type EmployeeSalesReport } from '@/lib/sales';
import { useSessionUser } from '@/lib/session';
import { useCachedSource } from '@/offline/cache';
import { useCachedFetch } from '@/offline/cached-fetch';
import { businessToday, datesInMonth, formatWhen, monthOf, prettyDay, prettyMonth } from '@/offline/day';
import type { ConfigSnapshot, FieldMasterDataSnapshot } from '@/types/sync';

import { Notice } from './notice';
import { PrimaryButton } from './primary-button';
import { ReportCards } from './report-cards';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { InfoCard, Pill, SummaryStrip } from './ui-cards';

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

/** A small heading above one of a report's tables. */
function TableTitle({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" style={styles.tableTitle}>
      {children}
    </ThemedText>
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
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Tap a day for its calls, followups and expenses.
          </ThemedText>
          <ReportCards
            rows={rows}
            rowKey={(r) => r.id}
            title={(r) => prettyDay(r.reportDate)}
            right={(r) => <Pill text={statusText(r.status)} accent={REPORT_ACCENT[r.status] ?? 'slate'} />}
            onRowPress={(r) => router.push({ pathname: '/dcr-report/[id]', params: { id: r.id } })}
            totals={[{ label: 'Reports this month', value: String(rows.length) }]}
          />
        </>
      )}
    </View>
  );
}

/* ───────────────────────────────── TA / DA Report ───────────────────────────────── */

const EXPENSE_TYPE: Record<TaDaDay['type'], string> = { TA: 'TA', DA: 'DA', TRAVEL: 'Travel', MEAL: 'Meal', MISC: 'Other', OTHER: 'Other' };

/**
 * Your TA, DA and claims the company has accepted: the month's totals with what is paid and unpaid, then each day as a card. The
 * server adds up the month and the year; the phone only shows them (and the table's own total is of the rows shown).
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
        <ReportCards
          rows={rows}
          rowKey={(r, i) => `${r.date}-${r.type}-${i}`}
          title={(r) => `${prettyDay(r.date)} · ${EXPENSE_TYPE[r.type]}`}
          right={(r) => <ThemedText type="smallBold">{formatRupees(r.amountPaise)}</ThemedText>}
          fields={(r) => [
            { label: 'Payment', value: <Pill text={r.status === 'PAID' ? 'Paid' : 'Not paid yet'} accent={r.status === 'PAID' ? 'green' : 'amber'} /> },
            { label: 'Route', value: r.route?.name ?? '' },
            { label: 'Note', value: r.remarks ?? '' },
            { label: 'Source', value: r.source === 'AUTO' ? 'Worked out by the server' : 'Entered by you' },
          ]}
          totals={[
            { label: 'Lines shown', value: String(rows.length) },
            { label: 'Total of these lines', value: formatRupees(rows.reduce((n, r) => n + r.amountPaise, 0)) },
          ]}
        />
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
        <ReportCards
          rows={days}
          rowKey={(d) => d.planDate}
          title={(d) => `${prettyDay(d.planDate)} · ${workingTypeLabel(d.workingType)}`}
          right={(d) => <Pill text={statusText(d.status)} accent={REPORT_ACCENT[d.status] ?? 'slate'} />}
          fields={(d) => [
            { label: 'Remarks', value: d.remarks ?? '' },
            {
              label: 'Reason',
              value:
                d.status === 'REJECTED' && d.approval ? (
                  reasons[d.planDate] ? (
                    reasons[d.planDate]!
                  ) : (
                    <PrimaryButton label="See the reason" variant="text" onPress={() => showReason(d.planDate, d.approval!.requestId)} />
                  )
                ) : (
                  ''
                ),
            },
          ]}
          totals={[{ label: 'Days planned', value: String(days.length) }]}
        />
      )}
    </View>
  );
}

/* ─────────────────────────────── Gift & Sales Report ─────────────────────────────── */

type GiftRow = { id: string; doctorName: string; productName: string; amountPaise: number; completedAt: string | null };
type StatusLine = { status: string; count: number; value: number };

const percent = (value: number | null) => (value === null ? 'No target' : `${value}%`);

/**
 * What you sold, ordered, counted and gave in the month, as cards: your secondary against target by product, orders by status,
 * how many of your outlets have a stock count, the gifts you handed over, and the samples given so far (a running total — the phone
 * only knows what is left of each allocation, not when it was given).
 */
export function SalesReport({ month, year }: { month: string; year: number }) {
  const me = useSessionUser();
  const config = useCachedSource<ConfigSnapshot>('config');
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const { from, to } = bounds(month);
  const secondary = useCachedFetch<EmployeeSalesReport>(`rep-sec:${year}:${month}`, () => getEmployeeSalesReport(me?.id ?? '', month, month));
  const orders = useCachedFetch<OrderView[]>(`rep-ord:${year}:${month}`, () => apiGet<OrderView[]>(`/sales/orders?from=${from}&to=${to}`, { auth: true, fy: true }));
  const stock = useCachedFetch<StockRow[]>(`rep-stock:${month}`, () => listStock(month));
  const gifts = useCachedFetch<GiftRow[]>('rep-gifts', () => apiGet<GiftRow[]>('/field-activity/doctor-gifts?status=DONE', { auth: true }));
  const zone = config.data?.settings.BUSINESS_TIMEZONE;

  const mine = (orders.data ?? []).filter((o) => !me || o.userId === me.id);
  const by = (s: OrderView['status']) => mine.filter((o) => o.status === s);
  const sum = (list: OrderView[]) => list.reduce((t, o) => t + o.totalAmountPaise, 0);
  const orderLines: StatusLine[] = [
    { status: 'Placed', count: by('PLACED').length, value: sum(by('PLACED')) },
    { status: 'Done', count: by('DONE').length, value: sum(by('DONE')) },
    { status: 'Cancelled', count: by('CANCELLED').length, value: sum(by('CANCELLED')) },
  ];

  const outlets = [...(master.data?.chemists ?? []).map((c) => `CHEMIST:${c.id}`), ...(master.data?.distributors ?? []).map((d) => `DISTRIBUTOR:${d.id}`)];
  const counted = new Set((stock.data ?? []).map((r) => `${r.outlet.type}:${r.outlet.id}`));
  const countedMine = outlets.filter((o) => counted.has(o)).length;

  const giftsThisMonth = (gifts.data ?? []).filter((g) => g.completedAt && monthOf(businessToday(zone, new Date(g.completedAt), config.data?.settings.DAY_START_TIME)) === month);

  const given = new Map<string, number>();
  for (const a of master.data?.sampleAllocations ?? []) given.set(a.productId, (given.get(a.productId) ?? 0) + (a.quantityAllocated - a.quantityRemaining));
  const productName = (id: string) => master.data?.products.find((p) => p.id === id)?.name ?? 'Product';
  const samples = [...given.entries()].filter(([, qty]) => qty > 0).map(([id, qty]) => ({ name: productName(id), qty }));

  const sec = secondary.data;
  const secondaryRows = (sec?.products ?? []).filter((p) => p.secondaryQty > 0 || p.targetPaise > 0 || p.primaryQty > 0);

  return (
    <View style={styles.stack}>
      <Stale fetchedAt={secondary.fetchedAt} stale={secondary.stale} error={secondary.error} />
      <Stale fetchedAt={orders.fetchedAt} stale={orders.stale} error={orders.error} />

      <TableTitle>{`Secondary sales · ${prettyMonth(month)}`}</TableTitle>
      {secondary.loading && !sec ? (
        <Notice tone="info">Loading…</Notice>
      ) : secondaryRows.length === 0 ? (
        <Notice tone="info">{sec ? 'No secondary sales, primary or target for this month.' : 'Connect once to load your sales.'}</Notice>
      ) : (
        <>
          <ReportCards
            rows={secondaryRows}
            rowKey={(r) => r.product.id}
            title={(r) => r.product.name}
            right={(r) => <ThemedText type="smallBold">{percent(r.achievementPercent)}</ThemedText>}
            fields={(r) => [
              { label: 'Primary (units)', value: String(r.primaryQty) },
              { label: 'Secondary (units)', value: String(r.secondaryQty) },
              { label: 'Secondary value', value: formatRupees(r.secondaryPaise) },
              { label: 'Target', value: formatRupees(r.targetPaise) },
            ]}
            totals={[
              { label: 'Primary (units)', value: String(secondaryRows.reduce((n, r) => n + r.primaryQty, 0)) },
              { label: 'Secondary (units)', value: String(secondaryRows.reduce((n, r) => n + r.secondaryQty, 0)) },
              { label: 'Secondary value', value: formatRupees(sec!.totals.secondaryPaise) },
              { label: 'Target', value: formatRupees(sec!.totals.targetPaise) },
              { label: 'Achieved', value: percent(sec!.totals.achievementPercent) },
            ]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Only secondary your manager approved counts toward your achievement.
          </ThemedText>
        </>
      )}

      <TableTitle>Orders</TableTitle>
      {orders.loading && !orders.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : (
        <ReportCards
          rows={orderLines}
          rowKey={(r) => r.status}
          title={(r) => r.status}
          right={(r) => <ThemedText type="smallBold">{formatRupees(r.value)}</ThemedText>}
          fields={(r) => [{ label: 'Orders', value: String(r.count) }]}
          totals={[
            { label: 'Orders placed and done', value: String(by('PLACED').length + by('DONE').length) },
            { label: 'Sales (placed and done)', value: formatRupees(sum(by('PLACED')) + sum(by('DONE'))) },
          ]}
        />
      )}

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Stock counts</ThemedText>
        <ThemedText type="small">{stock.data ? `${countedMine} of ${outlets.length} outlets counted for ${prettyMonth(month)}` : stock.loading ? 'Loading…' : 'Connect once to load the counts.'}</ThemedText>
      </ThemedView>

      <TableTitle>Gifts given</TableTitle>
      {gifts.data ? (
        giftsThisMonth.length === 0 ? (
          <Notice tone="info">No gifts given this month.</Notice>
        ) : (
          <ReportCards
            rows={giftsThisMonth}
            rowKey={(g) => g.id}
            title={(g) => g.productName}
            right={(g) => <ThemedText type="smallBold">{formatRupees(g.amountPaise)}</ThemedText>}
            fields={(g) => [{ label: 'Given to', value: g.doctorName }]}
            totals={[
              { label: 'Gifts given', value: String(giftsThisMonth.length) },
              { label: 'Total value', value: formatRupees(giftsThisMonth.reduce((t, g) => t + g.amountPaise, 0)) },
            ]}
          />
        )
      ) : (
        <Notice tone="info">{gifts.loading ? 'Loading…' : 'Connect once to load the gifts.'}</Notice>
      )}

      <TableTitle>Samples given so far</TableTitle>
      {samples.length === 0 ? (
        <Notice tone="info">No samples given yet.</Notice>
      ) : (
        <ReportCards
          rows={samples}
          rowKey={(r) => r.name}
          title={(r) => r.name}
          right={(r) => <ThemedText type="smallBold">{`${r.qty} given`}</ThemedText>}
          totals={[{ label: 'Total samples given', value: String(samples.reduce((n, r) => n + r.qty, 0)) }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  tableTitle: { marginTop: Spacing.one },
});
