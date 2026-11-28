import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing, type Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { apiGet } from '@/lib/api';
import { STATUS_LABEL, statusLabel, type ApprovalStatus } from '@/lib/approvals';
import { formatRupees } from '@/lib/money';
import { getMyTaDaDays, getMyTaDaYear, type TaDaDay } from '@/lib/my-reports';
import { getRejectionReason, workingTypeLabel, type DailyPlanDetail, type MonthlyPlanDetail } from '@/lib/planning';
import { useSessionUser } from '@/lib/session';
import { downloadTourPlan } from '@/lib/work-reports';
import { rupees } from '@/lib/xlsx';
import { useCachedFetch } from '@/offline/cached-fetch';
import { datesInMonth, prettyDay, prettyMonth } from '@/offline/day';

import { Notice } from './notice';
import { PrimaryButton } from './primary-button';
import { ReportList, ReportRow } from './report-kit';
import { ThemedText } from './themed-text';
import { InfoCard, Pill } from './ui-cards';

/**
 * The Reports tab's own lists (2026-11-28): DCR, Plans and Expenses, a month at a time. Each is short rows with only what matters, a
 * tap to the day where there is one, and one Excel button that downloads exactly the rows shown.
 */

const statusText = (status: string) => STATUS_LABEL[status as ApprovalStatus] ?? (status === 'DRAFT' ? 'Not sent' : status);
/** A Tour Plan's or Daily Plan's status: one approval since 2026-10-23, so "Waiting for approval" and never "Waiting for Admin". */
const planStatusText = (status: string) =>
  status in STATUS_LABEL ? statusLabel({ kind: 'MONTHLY_PLAN', status: status as ApprovalStatus }) : status === 'DRAFT' ? 'Not sent' : status;
export const STATUS_ACCENT: Record<string, Accent> = { APPROVED: 'green', MANAGER_APPROVED: 'green', SUBMITTED: 'amber', PENDING: 'amber', REQUESTED: 'amber', REJECTED: 'red', CANCELLED: 'slate', DRAFT: 'slate', WITHDRAWN: 'slate', REOPENED: 'slate', DONE: 'green', PLACED: 'amber' };
const bounds = (month: string) => {
  const days = datesInMonth(month);
  return { from: days[0]!, to: days[days.length - 1]! };
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const who = (name: string | null | undefined) => (name ?? 'Me').replace(/[^\w .-]/g, '').trim() || 'Me';

/* ───────────────────────────────── DCR ───────────────────────────────── */

type DcrRow = { id: string; reportDate: string; status: string; doctorCalls?: number; chemistCalls?: number; followups?: number };

/** One row a day: the date, its calls and follow-ups, where it stands. A tap opens that day's report. */
export function DcrReport({ month, year }: { month: string; year: number }) {
  const me = useSessionUser();
  const { from, to } = bounds(month);
  const list = useCachedFetch<DcrRow[]>(`rep-dcr:${year}:${month}`, () => apiGet<DcrRow[]>(`/field-activity/dcr?from=${from}&to=${to}`, { auth: true, fy: true }));
  const rows = [...(list.data ?? [])].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  const calls = (r: DcrRow) => (r.doctorCalls ?? 0) + (r.chemistCalls ?? 0);
  const approved = rows.filter((r) => r.status === 'APPROVED' || r.status === 'MANAGER_APPROVED').length;
  const sentBack = rows.filter((r) => r.status === 'REJECTED').length;

  return (
    <ReportList
      title="Daily reports"
      rows={rows}
      state={list}
      hasData={list.data !== null}
      tiles={[
        { label: 'Reports', value: rows.length, accent: 'blue' },
        { label: 'Approved', value: approved, accent: 'green' },
        { label: 'Sent back', value: sentBack, accent: sentBack > 0 ? 'red' : 'slate' },
      ]}
      empty="No daily reports this month."
      render={(r) => (
        <ReportRow
          key={r.id}
          title={prettyDay(r.reportDate)}
          subtitle={r.doctorCalls === undefined ? null : `${plural(r.doctorCalls, 'doctor call')} · ${plural(r.chemistCalls ?? 0, 'chemist call')} · ${plural(r.followups ?? 0, 'follow-up')}`}
          pill={{ text: statusText(r.status), accent: STATUS_ACCENT[r.status] ?? 'slate' }}
          onPress={() => router.push({ pathname: '/dcr-report/[id]', params: { id: r.id } })}
        />
      )}
      fileName={`GREYNOTE DCR ${month} ${who(me?.name)}.xlsx`}
      sheet={() => ({
        sheet: `DCR ${month}`,
        title: `${me?.name ?? ''} · Daily reports · ${prettyMonth(month)}`,
        header: ['Date', 'Doctor calls', 'Chemist calls', 'Follow-ups', 'Status'],
        rows: rows.map((r) => [r.reportDate, r.doctorCalls ?? null, r.chemistCalls ?? null, r.followups ?? null, statusText(r.status)]),
        totals: ['Total', rows.reduce((n, r) => n + (r.doctorCalls ?? 0), 0), rows.reduce((n, r) => n + (r.chemistCalls ?? 0), 0), rows.reduce((n, r) => n + (r.followups ?? 0), 0), `${rows.length} reports · ${rows.reduce((n, r) => n + calls(r), 0)} calls`],
      })}
    />
  );
}

/* ───────────────────────────────── Plans ───────────────────────────────── */

/** The month's Tour Plan (status, reason, its Excel) and the Daily Plans, one row a day; a tap opens the day. */
export function PlansReport({ month, year }: { month: string; year: number }) {
  const me = useSessionUser();
  const { from, to } = bounds(month);
  const monthly = useCachedFetch<MonthlyPlanDetail[]>(`rep-tpm:${year}:${month}`, () => apiGet<MonthlyPlanDetail[]>(`/planning/monthly?from=${month}&to=${month}`, { auth: true, fy: true }));
  const daily = useCachedFetch<DailyPlanDetail[]>(`rep-tpd:${year}:${month}`, () => apiGet<DailyPlanDetail[]>(`/planning/daily?from=${from}&to=${to}`, { auth: true, fy: true }));
  const plan = (monthly.data ?? []).find((m) => m.planMonth === month) ?? null;
  const days = [...(daily.data ?? [])].sort((a, b) => b.planDate.localeCompare(a.planDate));
  const approved = plan?.status === 'APPROVED' || plan?.status === 'MANAGER_APPROVED';
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const download = async () => {
    if (!me) return;
    setBusy(true);
    setNote(null);
    try {
      const done = await downloadTourPlan({ id: me.id, name: me.name ?? 'Me' }, month, prettyMonth(month));
      if (done) setNote({ ok: true, text: done });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Couldn’t make the file. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.stack}>
      <InfoCard>
        <View style={styles.between}>
          <ThemedText type="smallBold" style={styles.grow}>{`Tour Plan · ${prettyMonth(month)}`}</ThemedText>
          {plan ? <Pill text={planStatusText(plan.status)} accent={STATUS_ACCENT[plan.status] ?? 'slate'} /> : null}
        </View>
        {!plan ? <ThemedText type="small" themeColor="textSecondary">{monthly.loading ? 'Loading…' : 'No Tour Plan for this month.'}</ThemedText> : null}
        {plan?.status === 'REJECTED' && plan.approval ? (
          reason ? (
            <ThemedText type="small" themeColor="danger">{`Reason: ${reason}`}</ThemedText>
          ) : (
            <PrimaryButton
              label="See the reason"
              variant="text"
              onPress={() => {
                setReason('Loading…');
                void getRejectionReason(plan.approval!.requestId)
                  .then((r) => setReason(r ?? 'No reason was given.'))
                  .catch(() => setReason('Couldn’t load the reason. Check your connection.'));
              }}
            />
          )
        ) : null}
        {plan ? (
          <PrimaryButton label={approved ? 'Download Tour Plan (Excel)' : 'Tour Plan downloads once approved'} variant="text" loading={busy} disabled={!approved} onPress={download} />
        ) : null}
        {note ? <ThemedText type="small" themeColor={note.ok ? 'textSecondary' : 'danger'}>{note.text}</ThemedText> : null}
      </InfoCard>

      <ReportList
        title="Daily plans"
        rows={days}
        state={daily}
        hasData={daily.data !== null}
        empty="No daily plans this month."
        render={(d) => (
          <ReportRow
            key={d.planDate}
            title={prettyDay(d.planDate)}
            subtitle={`${workingTypeLabel(d.workingType)}${d.doctors?.length ? ` · ${plural(d.doctors.length, 'doctor')}` : ''}`}
            pill={{ text: planStatusText(d.status), accent: STATUS_ACCENT[d.status] ?? 'slate' }}
            onPress={() => router.push({ pathname: '/daily-plan-detail', params: { date: d.planDate } })}
          />
        )}
        fileName={`GREYNOTE DAILY PLANS ${month} ${who(me?.name)}.xlsx`}
        sheet={() => ({
          sheet: `Daily plans ${month}`,
          title: `${me?.name ?? ''} · Daily plans · ${prettyMonth(month)}`,
          header: ['Date', 'Working type', 'Doctors', 'Status', 'Remarks'],
          rows: days.map((d) => [d.planDate, workingTypeLabel(d.workingType), d.doctors?.length ?? 0, planStatusText(d.status), d.remarks ?? '']),
          totals: ['Days planned', days.length],
        })}
      />
    </View>
  );
}

/* ───────────────────────────────── Expenses ───────────────────────────────── */

type ExpenseDay = { date: string; route: string | null; ta: number; da: number; other: number; total: number; paid: boolean; lines: TaDaDay[] };
const OTHER_TYPES = new Set<TaDaDay['type']>(['OTHER', 'TRAVEL', 'MEAL', 'MISC']);
const LINE_TYPE: Record<TaDaDay['type'], string> = { TA: 'TA', DA: 'DA', TRAVEL: 'Travel', MEAL: 'Meal', MISC: 'Other', OTHER: 'Other' };

/** TA, DA and other expenses, one row a date (TA · DA · Other · Total, paid or not); a tap shows that day's lines and notes. */
export function ExpensesReport({ month, year }: { month: string; year: number }) {
  const me = useSessionUser();
  const theme = useTheme();
  const yearly = useCachedFetch(`rep-tada-year:${year}`, () => getMyTaDaYear(year));
  const daysData = useCachedFetch(`rep-tada-days:${year}:${month}`, () => getMyTaDaDays(month));
  const figures = yearly.data?.months.find((m) => m.month === month) ?? null;
  const [open, setOpen] = useState<string | null>(null);

  const byDate = new Map<string, ExpenseDay>();
  for (const l of daysData.data?.rows ?? []) {
    const d = byDate.get(l.date) ?? { date: l.date, route: null, ta: 0, da: 0, other: 0, total: 0, paid: true, lines: [] };
    if (l.type === 'TA') d.ta += l.amountPaise;
    else if (l.type === 'DA') d.da += l.amountPaise;
    else if (OTHER_TYPES.has(l.type)) d.other += l.amountPaise;
    d.total += l.amountPaise;
    d.paid &&= l.status === 'PAID';
    d.route ??= l.route?.name ?? null;
    d.lines.push(l);
    byDate.set(l.date, d);
  }
  const days = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  const sum = (k: 'ta' | 'da' | 'other' | 'total') => days.reduce((n, d) => n + d[k], 0);

  return (
    <ReportList
      title="Expenses by day"
      rows={days}
      state={daysData}
      hasData={daysData.data !== null}
      tiles={
        figures
          ? [
              { label: 'Total', value: formatRupees(figures.totalPaise), accent: 'purple' },
              { label: 'Paid', value: formatRupees(figures.paidPaise), accent: 'green' },
              { label: 'Not paid', value: formatRupees(figures.unpaidPaise), accent: figures.unpaidPaise > 0 ? 'amber' : 'slate' },
            ]
          : undefined
      }
      note={
        <>
          {figures && figures.flaggedRows > 0 ? <Notice tone="warning">{`${plural(figures.flaggedRows, 'travel amount')} couldn’t be worked out from the route distance and may be low. Ask Admin.`}</Notice> : null}
          {daysData.data?.truncated ? <Notice tone="info">The list is long and may be cut short. The tiles above are complete.</Notice> : null}
        </>
      }
      empty="No expenses this month. TA and DA appear once a daily report is approved."
      render={(d) => (
        <View key={d.date} style={styles.stackTight}>
          <ReportRow
            title={prettyDay(d.date)}
            subtitle={`${d.route ? `${d.route} · ` : ''}TA ${formatRupees(d.ta)} · DA ${formatRupees(d.da)}${d.other ? ` · Other ${formatRupees(d.other)}` : ''}`}
            value={formatRupees(d.total)}
            pill={{ text: d.paid ? 'Paid' : 'Not paid', accent: d.paid ? 'green' : 'amber' }}
            onPress={() => setOpen(open === d.date ? null : d.date)}
          />
          {open === d.date ? (
            <View style={[styles.lines, { borderColor: theme.border }]}>
              {d.lines.map((l, i) => (
                <View key={`${l.type}-${i}`} style={styles.line}>
                  <ThemedText type="small" style={styles.grow}>{`${LINE_TYPE[l.type]}${l.source === 'AUTO' ? '' : ' (entered by you)'}${l.remarks ? ` · ${l.remarks}` : ''}`}</ThemedText>
                  <ThemedText type="small">{formatRupees(l.amountPaise)}</ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
      fileName={`GREYNOTE EXPENSES ${month} ${who(me?.name)}.xlsx`}
      sheet={() => ({
        sheet: `Expenses ${month}`,
        title: `${me?.name ?? ''} · Expenses · ${prettyMonth(month)}`,
        header: ['Date', 'Route', 'TA (₹)', 'DA (₹)', 'Other (₹)', 'Total (₹)', 'Payment'],
        rows: days.map((d) => [d.date, d.route ?? '', rupees(d.ta), rupees(d.da), rupees(d.other), rupees(d.total), d.paid ? 'Paid' : 'Not paid']),
        totals: ['Total', '', rupees(sum('ta')), rupees(sum('da')), rupees(sum('other')), rupees(sum('total')), ''],
      })}
    />
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  stackTight: { gap: Spacing.one },
  between: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  lines: { borderLeftWidth: 2, marginLeft: Spacing.three, paddingLeft: Spacing.two, gap: 2 },
  line: { flexDirection: 'row', gap: Spacing.two },
});
