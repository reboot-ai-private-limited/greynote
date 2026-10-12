import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { STATUS_LABEL, type ApprovalStatus } from '@/lib/approvals';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { getSalesDashboard, listTeamDcrs, type SalesDashboardRow } from '@/lib/team';
import { useColleagues, useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { datesInMonth, formatWhen, monthOf, prettyDay } from '@/offline/day';

type Report = 'dcr' | 'sales';
const REPORTS: { value: Report; label: string }[] = [
  { value: 'dcr', label: 'Daily reports' },
  { value: 'sales', label: 'Sales & compliance' },
];

const statusText = (status: string) => STATUS_LABEL[status as ApprovalStatus] ?? (status === 'DRAFT' ? 'Not sent' : status);

const bounds = (month: string) => {
  const days = datesInMonth(month);
  return { from: days[0]!, to: days[days.length - 1]! };
};

const rupees = (paise: number | null) => (paise === null ? '—' : formatRupees(paise));

/**
 * Team reports (managers): your downline's daily reports and a sales and compliance table, by month. Read-only, and the
 * server limits it to your own team. Needs a connection; the phone keeps the last copy of each month it loaded.
 */
export default function TeamReportsScreen() {
  const fy = useFinancialYear();
  const [report, setReport] = useState<Report>('dcr');
  const [picked, setPicked] = useState<string | null>(null);

  const start = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > fy.lastMonth ? fy.lastMonth : m);
  const month = clamp(picked ?? start);

  return (
    <ScreenShell title="Team reports">
      <FyBanner />
      <ChoiceChips options={REPORTS} value={report} onChange={setReport} />
      <MonthStepper value={month} onChange={setPicked} min={fy.firstMonth} max={fy.lastMonth} />
      {report === 'dcr' ? <TeamDcrList month={month} year={fy.year} /> : <TeamSales month={month} year={fy.year} />}
    </ScreenShell>
  );
}

function Stale({ fetchedAt, stale, error, online }: { fetchedAt: string | null; stale: boolean; error: string | null; online: boolean }) {
  return (
    <>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {stale && fetchedAt ? <Notice tone="info">{`${online ? 'Updating… ' : 'You’re offline. '}Showing the copy from ${formatWhen(fetchedAt)}.`}</Notice> : null}
    </>
  );
}

/* ───────────────────────────── the team's daily reports ───────────────────────────── */

function TeamDcrList({ month, year }: { month: string; year: number }) {
  const online = useOnline();
  const { colleagues } = useColleagues();
  const team = useMemo(() => colleagues.filter((c) => c.relation === 'TEAM'), [colleagues]);
  const names = useMemo(() => new Map(colleagues.map((c) => [c.id, c.name])), [colleagues]);
  const [who, setWho] = useState<string>('ALL');
  const { from, to } = bounds(month);
  const list = useCachedFetch(`team-dcr:${year}:${month}:${who}`, () => listTeamDcrs(from, to, who === 'ALL' ? null : who));
  const rows = [...(list.data ?? [])].sort((a, b) => b.reportDate.localeCompare(a.reportDate) || (names.get(a.userId) ?? '').localeCompare(names.get(b.userId) ?? ''));

  return (
    <View style={styles.stack}>
      {team.length > 1 ? (
        <ChoiceChips options={[{ value: 'ALL', label: 'Everyone' }, ...team.map((t) => ({ value: t.id, label: t.name }))]} value={who} onChange={setWho} />
      ) : null}
      <Stale fetchedAt={list.fetchedAt} stale={list.stale} error={list.error} online={online} />
      {list.loading && !list.data ? (
        <Skeleton cards={3} lines={2} />
      ) : rows.length === 0 ? (
        <Notice tone="info">{list.data ? 'No daily reports from your team this month.' : 'Connect once to load your team’s reports.'}</Notice>
      ) : (
        rows.map((r) => (
          <Pressable key={r.id} accessibilityRole="button" onPress={() => (online ? router.push({ pathname: '/dcr-report/[id]', params: { id: r.id } }) : undefined)}>
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{names.get(r.userId) ?? 'Employee'}</ThemedText>
              <ThemedText type="small">{prettyDay(r.reportDate)}</ThemedText>
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

/* ─────────────────────────── the team's sales and compliance ─────────────────────────── */

const pair = (c: { submitted: number; approved: number }, of: number) => `${c.submitted}/${of} sent · ${c.approved} approved`;

function SalesCard({ row }: { row: SalesDashboardRow }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{`${row.employee.name} · ${row.employee.employeeCode}`}</ThemedText>
      {row.designation || row.zone ? (
        <ThemedText type="small" themeColor="textSecondary">
          {[row.designation, row.zone].filter(Boolean).join(' · ')}
        </ThemedText>
      ) : null}
      <ThemedText type="small">{`Working days: ${row.workingDays}`}</ThemedText>
      <ThemedText type="small">{`Plans: ${pair(row.plan, row.workingDays)}`}</ThemedText>
      <ThemedText type="small">{`Daily reports: ${pair(row.dcr, row.workingDays)}`}</ThemedText>
      <ThemedText type="small">{`TA ${rupees(row.taPaise)} · DA ${rupees(row.daPaise)}`}</ThemedText>
      <ThemedText type="small">{`Target ${rupees(row.targetPaise)} · Achieved ${rupees(row.achievedPaise)}`}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{`Primary ${rupees(row.primaryPaise)}`}</ThemedText>
    </ThemedView>
  );
}

function TeamSales({ month, year }: { month: string; year: number }) {
  const online = useOnline();
  const { from, to } = bounds(month);
  const dash = useCachedFetch(`team-sales:${year}:${month}`, () => getSalesDashboard(from, to));
  const d = dash.data;

  return (
    <View style={styles.stack}>
      <Stale fetchedAt={dash.fetchedAt} stale={dash.stale} error={dash.error} online={online} />
      {dash.loading && !d ? <Skeleton cards={3} lines={4} /> : null}
      {d && d.rows.length === 0 ? <Notice tone="info">Nobody in your team yet.</Notice> : null}
      {d && d.rows.length > 0 ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">{`Team total · ${d.totals.employees} employee${d.totals.employees === 1 ? '' : 's'}`}</ThemedText>
          <ThemedText type="small">{`TA ${rupees(d.totals.taPaise)} · DA ${rupees(d.totals.daPaise)}`}</ThemedText>
          <ThemedText type="small">{`Target ${rupees(d.totals.targetPaise)} · Achieved ${rupees(d.totals.achievedPaise)}`}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{`Primary ${rupees(d.totals.primaryPaise)}`}</ThemedText>
        </ThemedView>
      ) : null}
      {d?.rows.map((r) => <SalesCard key={r.employee.id} row={r} />)}
      {d && d.total > d.rows.length ? <Notice tone="info">{`Showing ${d.rows.length} of ${d.total} employees.`}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.half },
});
