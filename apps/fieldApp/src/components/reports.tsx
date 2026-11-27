import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing, type Accent } from '@/constants/theme';
import { apiGet } from '@/lib/api';
import { STATUS_LABEL, statusLabel, type ApprovalStatus } from '@/lib/approvals';
import { formatRupees } from '@/lib/money';
import { getMyDcrCoverage, getMyDcrYear, getMyTaDaDays, getMyTaDaYear, type TaDaDay } from '@/lib/my-reports';
import { downloadTourPlan } from '@/lib/work-reports';
import { useSessionUser } from '@/lib/session';
import { getRejectionReason, workingTypeLabel, type DailyPlanDetail, type MonthlyPlanDetail } from '@/lib/planning';
import { useCachedFetch } from '@/offline/cached-fetch';
import { datesInMonth, formatWhen, prettyDay, prettyMonth } from '@/offline/day';

import { CallPerformanceCard } from './call-performance-card';
import { Notice } from './notice';
import { PrimaryButton } from './primary-button';
import { ReportCards } from './report-cards';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { InfoCard, Pill, SummaryStrip } from './ui-cards';

const statusText = (status: string) => STATUS_LABEL[status as ApprovalStatus] ?? (status === 'DRAFT' ? 'Not sent' : status);
/** A Tour Plan's or Daily Plan's status: one approval since 2026-10-23, so "Waiting for approval" and never "Waiting for Admin". */
const planStatusText = (status: string) =>
  status in STATUS_LABEL ? statusLabel({ kind: 'MONTHLY_PLAN', status: status as ApprovalStatus }) : status === 'DRAFT' ? 'Not sent' : status;
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
  const me = useSessionUser();

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
      {me ? <CallPerformanceCard userId={me.id} month={month} /> : null}
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
  const monthly = useCachedFetch<MonthlyPlanDetail[]>(`rep-tpm:${year}:${month}`, () => apiGet<MonthlyPlanDetail[]>(`/planning/monthly?from=${month}&to=${month}`, { auth: true, fy: true }));
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const plan = (monthly.data ?? []).find((m) => m.planMonth === month) ?? null;
  const me = useSessionUser();
  const [downloading, setDownloading] = useState(false);
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const approved = plan?.status === 'APPROVED' || plan?.status === 'MANAGER_APPROVED';
  const download = async () => {
    if (!me) return;
    setDownloading(true);
    setNote(null);
    try {
      const done = await downloadTourPlan({ id: me.id, name: me.name ?? 'Me' }, month, prettyMonth(month));
      if (done) setNote({ tone: 'success', text: done });
    } catch (err) {
      setNote({ tone: 'danger', text: err instanceof Error ? err.message : 'Couldn’t make the file. Please try again.' });
    } finally {
      setDownloading(false);
    }
  };

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
      <Stale {...monthly} />
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">{`Tour Plan · ${prettyMonth(month)}`}</ThemedText>
        <ThemedText type="small" themeColor={plan?.status === 'REJECTED' ? 'danger' : 'textSecondary'}>
          {plan ? planStatusText(plan.status) : monthly.loading ? 'Loading…' : 'No Tour Plan for this month.'}
        </ThemedText>
        {plan?.status === 'REJECTED' && plan.approval ? (
          reasons.monthly ? (
            <ThemedText type="small">{`Reason: ${reasons.monthly}`}</ThemedText>
          ) : (
            <PrimaryButton label="See the reason" variant="text" onPress={() => showReason('monthly', plan.approval!.requestId)} />
          )
        ) : null}
        {plan ? (
          <>
            <PrimaryButton label="Download Tour Plan (Excel)" variant="text" loading={downloading} disabled={!approved} onPress={download} />
            {!approved ? <ThemedText type="small" themeColor="textSecondary">You can download it once it is approved.</ThemedText> : null}
          </>
        ) : null}
        {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}
      </ThemedView>

    </View>
  );
}


/** Your Daily Plans of the month, one card a day; tap a day for it in detail (routes, doctors by name, status, approval history). */
export function DailyPlanReport({ month, year }: { month: string; year: number }) {
  const { from, to } = bounds(month);
  const daily = useCachedFetch<DailyPlanDetail[]>(`rep-tpd:${year}:${month}`, () => apiGet<DailyPlanDetail[]>(`/planning/daily?from=${from}&to=${to}`, { auth: true, fy: true }));
  const days = [...(daily.data ?? [])].sort((a, b) => b.planDate.localeCompare(a.planDate));
  return (
    <View style={styles.stack}>
      <Stale {...daily} />
      {daily.loading && !daily.data ? (
        <Notice tone="info">Loading…</Notice>
      ) : days.length === 0 ? (
        <Notice tone="info">{daily.data ? 'No daily plans this month.' : 'Connect once to load your plans.'}</Notice>
      ) : (
        <ReportCards
          rows={days}
          rowKey={(d) => d.planDate}
          title={(d) => `${prettyDay(d.planDate)} · ${workingTypeLabel(d.workingType)}`}
          right={(d) => <Pill text={planStatusText(d.status)} accent={d.status === 'MANAGER_APPROVED' ? 'green' : (REPORT_ACCENT[d.status] ?? 'slate')} />}
          fields={(d) => [
            { label: 'Doctors planned', value: d.doctors ? String(d.doctors.length) : '' },
            { label: 'Remarks', value: d.remarks ?? '' },
          ]}
          onRowPress={(d) => router.push({ pathname: '/daily-plan-detail', params: { date: d.planDate } })}
          totals={[{ label: 'Days planned', value: String(days.length) }]}
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
