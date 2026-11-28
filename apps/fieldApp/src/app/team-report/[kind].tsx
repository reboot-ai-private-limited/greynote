import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { FyBanner } from '@/components/fy-banner';
import { MonthStepper } from '@/components/month-stepper';
import { Notice } from '@/components/notice';
import { ReportList, ReportRow } from '@/components/report-kit';
import { ScreenShell } from '@/components/screen-shell';
import { InfoCard } from '@/components/ui-cards';
import type { Accent } from '@/constants/theme';
import { useFinancialYear } from '@/lib/financial-year';
import { formatRupees } from '@/lib/money';
import { getCallPerformance, type CallPerformance } from '@/lib/my-reports';
import { EXPENSE_STATE_TEXT, SECONDARY_STATE_TEXT, getTeamExpenses, getTeamLeaves, getTeamOverview, getTeamStock, type SecondaryState, type TeamExpenseRow, type TeamLeave, type TeamOverview, type TeamStock } from '@/lib/team-section';
import { useSessionUser } from '@/lib/session';
import { rupees } from '@/lib/xlsx';
import { useCachedFetch } from '@/offline/cached-fetch';
import { datesInMonth, monthOf, prettyDay, prettyMonth } from '@/offline/day';

/**
 * One team report for a month (2026-11-28, Team → Reports): tiles for the team, then one row per person — a tap opens their page on the
 * matching tab — and one Excel of exactly those rows. Built from the team reads the phone already has; nothing new on the server.
 */
type Kind = 'calls' | 'dcr' | 'secondary' | 'expenses' | 'leave';
const TITLES: Record<Kind, { title: string; subtitle: string }> = {
  calls: { title: 'Call average & coverage', subtitle: 'Per person: calls per working day, doctors met' },
  dcr: { title: 'Daily reports', subtitle: 'Per person: reports and plans sent' },
  secondary: { title: 'Secondary sales', subtitle: 'Per person: sent, approved, units' },
  expenses: { title: 'Expenses', subtitle: 'Per person: the month’s total and where it stands' },
  leave: { title: 'Leave', subtitle: 'Your team’s leave touching the month' },
};
type Props = { month: string; year: number };
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
const open = (id: string, month: string, tab?: string) => router.push({ pathname: '/team-member', params: { id, month, ...(tab ? { tab } : {}) } });
const fileOf = (what: string, month: string) => `GREYNOTE TEAM ${what} ${month}.xlsx`;

function CallsReport({ month }: Props) {
  const me = useSessionUser();
  const report = useCachedFetch<CallPerformance>(`call-performance:${month}`, () => getCallPerformance(month));
  const rows = (report.data?.rows ?? []).filter((r) => r.employee.id !== me?.id).sort((a, b) => (a.doctorCallAvg ?? -1) - (b.doctorCallAvg ?? -1) || a.employee.name.localeCompare(b.employee.name));
  const t = report.data?.totals;
  return (
    <ReportList
      title="People"
      rows={rows}
      state={report}
      hasData={report.data !== null}
      tiles={t ? [{ label: 'Call average', value: t.doctorCallAvg == null ? '—' : t.doctorCallAvg.toFixed(1), accent: 'teal' }, { label: 'Coverage', value: pct(t.coverage.coveragePct), accent: 'blue' }, { label: 'Frequency cov.', value: pct(t.coverage.frequencyPct), accent: 'green' }] : undefined}
      empty="Nobody in your team has figures this month."
      render={(r) => (
        <ReportRow
          key={r.employee.id}
          title={r.employee.name}
          subtitle={`${r.doctorCalls} calls over ${r.workingDays ?? r.fieldDays} working days · coverage ${pct(r.coverage.coveragePct)} · frequency ${pct(r.coverage.frequencyPct)}`}
          value={r.doctorCallAvg == null ? '—' : `${r.doctorCallAvg.toFixed(1)}/day`}
          onPress={() => open(r.employee.id, month)}
        />
      )}
      fileName={fileOf('CALL AVERAGE', month)}
      sheet={() => ({
        sheet: `Calls ${month}`,
        title: `Team · Call average & coverage · ${prettyMonth(month)}`,
        header: ['Employee', 'Code', 'Working days', 'Doctor calls', 'Call average', 'Chemist calls', 'Coverage %', 'Frequency coverage %'],
        rows: rows.map((r) => [r.employee.name, r.employee.employeeCode, r.workingDays ?? r.fieldDays, r.doctorCalls, r.doctorCallAvg, r.chemistCalls, r.coverage.coveragePct, r.coverage.frequencyPct]),
      })}
    />
  );
}

function DcrReport({ month, year }: Props) {
  const report = useCachedFetch<TeamOverview>(`team-overview:${year}:${month}`, () => getTeamOverview({ month, scope: 'all' }));
  const rows = [...(report.data?.rows ?? [])].sort((a, b) => a.dcr.submitted / Math.max(1, a.workingDays) - b.dcr.submitted / Math.max(1, b.workingDays) || a.employee.name.localeCompare(b.employee.name));
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + f(r), 0);
  return (
    <ReportList
      title="People"
      rows={rows}
      state={report}
      hasData={report.data !== null}
      tiles={rows.length ? [{ label: 'Reports in', value: `${sum((r) => r.dcr.submitted)}/${sum((r) => r.workingDays)}`, accent: 'blue' }, { label: 'Plans in', value: `${sum((r) => r.plan.submitted)}/${sum((r) => r.workingDays)}`, accent: 'teal' }, { label: 'Sent late', value: sum((r) => r.field.lateDays), accent: sum((r) => r.field.lateDays) > 0 ? 'amber' : 'slate' }] : undefined}
      empty="Nobody in your team has a month to show."
      render={(r) => {
        const missing = r.workingDays - r.dcr.submitted;
        return (
          <ReportRow
            key={r.employee.id}
            title={r.employee.name}
            subtitle={`Plans ${r.plan.submitted}/${r.workingDays} · ${r.field.doctorCalls} doctor calls${r.field.lateDays ? ` · ${r.field.lateDays} late` : ''}`}
            value={`${r.dcr.submitted}/${r.workingDays}`}
            pill={missing > 0 ? { text: `${missing} missing`, accent: 'red' as Accent } : { text: 'All in', accent: 'green' as Accent }}
            onPress={() => open(r.employee.id, month, 'dcr')}
          />
        );
      }}
      fileName={fileOf('DAILY REPORTS', month)}
      sheet={() => ({
        sheet: `DCR ${month}`,
        title: `Team · Daily reports · ${prettyMonth(month)}`,
        header: ['Employee', 'Code', 'Working days', 'Reports sent', 'Reports approved', 'Plans sent', 'Sent late', 'Doctor calls', 'Chemist calls'],
        rows: rows.map((r) => [r.employee.name, r.employee.employeeCode, r.workingDays, r.dcr.submitted, r.dcr.approved, r.plan.submitted, r.field.lateDays, r.field.doctorCalls, r.field.chemistCalls]),
      })}
    />
  );
}

const SECONDARY_ACCENT: Record<SecondaryState, Accent> = { NOT_ENTERED: 'slate', DRAFT: 'slate', PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' };
function SecondaryReport({ month, year }: Props) {
  const report = useCachedFetch<TeamStock>(`team-stock:${year}:${month}`, () => getTeamStock({ month, scope: 'all' }));
  const rows = [...(report.data?.items ?? [])].sort((a, b) => Number(b.waitingOnYou) - Number(a.waitingOnYou) || a.user.name.localeCompare(b.user.name));
  const s = report.data?.tiles.secondary ?? {};
  return (
    <ReportList
      title="People"
      rows={rows}
      state={report}
      hasData={report.data !== null}
      tiles={report.data ? [{ label: 'Approved', value: s.APPROVED ?? 0, accent: 'green' }, { label: 'Waiting for you', value: s.PENDING ?? 0, accent: (s.PENDING ?? 0) > 0 ? 'amber' : 'slate' }, { label: 'Not sent', value: (s.NOT_ENTERED ?? 0) + (s.DRAFT ?? 0), accent: 'slate' }] : undefined}
      empty="Nobody in your team enters secondary sales."
      render={(r) => (
        <ReportRow
          key={r.user.id}
          title={r.user.name}
          subtitle={`${r.secondaryUnits ?? 0} units approved${r.missingOutlets.length ? ` · ${r.missingOutlets.length} outlet${r.missingOutlets.length === 1 ? '' : 's'} without stock` : ''}`}
          pill={{ text: SECONDARY_STATE_TEXT[r.secondary], accent: SECONDARY_ACCENT[r.secondary] }}
          onPress={() => open(r.user.id, month, 'secondary')}
        />
      )}
      fileName={fileOf('SECONDARY', month)}
      sheet={() => ({
        sheet: `Secondary ${month}`,
        title: `Team · Secondary sales · ${prettyMonth(month)}`,
        header: ['Employee', 'Code', 'Status', 'Units approved', 'Outlets without stock'],
        rows: rows.map((r) => [r.user.name, r.user.employeeCode, SECONDARY_STATE_TEXT[r.secondary], r.secondaryUnits ?? 0, r.missingOutlets.length]),
      })}
    />
  );
}

function ExpensesReport({ month, year }: Props) {
  const report = useCachedFetch<{ month: string; total: number; items: TeamExpenseRow[] }>(`team-expenses:${year}:${month}`, () => getTeamExpenses({ month }));
  const rows = [...(report.data?.items ?? [])].sort((a, b) => Number(b.waitingOnYou) - Number(a.waitingOnYou) || b.totalPaise - a.totalPaise);
  const total = rows.reduce((n, r) => n + r.totalPaise, 0);
  return (
    <ReportList
      title="People"
      rows={rows}
      state={report}
      hasData={report.data !== null}
      tiles={report.data ? [{ label: 'Team total', value: formatRupees(total), accent: 'purple' }, { label: 'Waiting for you', value: rows.filter((r) => r.waitingOnYou).length, accent: rows.some((r) => r.waitingOnYou) ? 'amber' : 'slate' }, { label: 'Approved', value: rows.filter((r) => r.status === 'APPROVED').length, accent: 'green' }] : undefined}
      empty="No expenses in your team this month."
      render={(r) => (
        <ReportRow
          key={r.user.id}
          title={r.user.name}
          subtitle={`TA ${formatRupees(r.taPaise)} · DA ${formatRupees(r.daPaise)} · Other ${formatRupees(r.otherPaise)}`}
          value={formatRupees(r.totalPaise)}
          pill={r.waitingOnYou ? { text: 'Waiting for you', accent: 'amber' } : EXPENSE_STATE_TEXT[r.status]}
          onPress={() => open(r.user.id, month, 'expenses')}
        />
      )}
      fileName={fileOf('EXPENSES', month)}
      sheet={() => ({
        sheet: `Expenses ${month}`,
        title: `Team · Expenses · ${prettyMonth(month)}`,
        header: ['Employee', 'Code', 'TA (₹)', 'DA (₹)', 'Other (₹)', 'Total (₹)', 'Status'],
        rows: rows.map((r) => [r.user.name, r.user.employeeCode, rupees(r.taPaise), rupees(r.daPaise), rupees(r.otherPaise), rupees(r.totalPaise), EXPENSE_STATE_TEXT[r.status].text]),
        totals: ['Total', '', rupees(rows.reduce((n, r) => n + r.taPaise, 0)), rupees(rows.reduce((n, r) => n + r.daPaise, 0)), rupees(rows.reduce((n, r) => n + r.otherPaise, 0)), rupees(total), ''],
      })}
    />
  );
}

const LEAVE_TEXT: Record<TeamLeave['status'], { text: string; accent: Accent }> = { SUBMITTED: { text: 'Waiting', accent: 'amber' }, MANAGER_APPROVED: { text: 'Approved', accent: 'green' }, APPROVED: { text: 'Approved', accent: 'green' } };
function LeaveReport({ month, year }: Props) {
  const days = datesInMonth(month);
  const report = useCachedFetch<{ from: string; to: string; items: TeamLeave[] }>(`team-leaves:${year}:${month}`, () => getTeamLeaves({ from: days[0]!, to: days[days.length - 1]!, scope: 'all' }));
  const rows = [...(report.data?.items ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const span = (l: TeamLeave) => (l.startDate === l.endDate ? prettyDay(l.startDate) : `${prettyDay(l.startDate)} – ${prettyDay(l.endDate)}`);
  return (
    <ReportList
      title="Leave"
      rows={rows}
      state={report}
      hasData={report.data !== null}
      tiles={report.data ? [{ label: 'Requests', value: rows.length, accent: 'blue' }, { label: 'Days', value: rows.reduce((n, l) => n + l.daysCount, 0), accent: 'purple' }, { label: 'Waiting', value: rows.filter((l) => l.status === 'SUBMITTED').length, accent: rows.some((l) => l.status === 'SUBMITTED') ? 'amber' : 'slate' }] : undefined}
      empty="No leave in your team this month."
      render={(l) => (
        <ReportRow key={l.leaveId} title={l.user.name} subtitle={`${l.leaveType ?? 'Leave'} · ${span(l)} · ${l.daysCount} day${l.daysCount === 1 ? '' : 's'}`} pill={LEAVE_TEXT[l.status]} onPress={() => open(l.user.id, month, 'leave')} />
      )}
      fileName={fileOf('LEAVE', month)}
      sheet={() => ({
        sheet: `Leave ${month}`,
        title: `Team · Leave · ${prettyMonth(month)}`,
        header: ['Employee', 'Code', 'Type', 'From', 'To', 'Days', 'Status'],
        rows: rows.map((l) => [l.user.name, l.user.employeeCode, l.leaveType ?? '', l.startDate, l.endDate, l.daysCount, LEAVE_TEXT[l.status].text]),
        totals: ['Total', '', '', '', '', rows.reduce((n, l) => n + l.daysCount, 0), ''],
      })}
    />
  );
}

const REPORTS: Record<Kind, (p: Props) => React.JSX.Element> = { calls: CallsReport, dcr: DcrReport, secondary: SecondaryReport, expenses: ExpensesReport, leave: LeaveReport };

export default function TeamReportScreen() {
  const params = useLocalSearchParams<{ kind: string; month?: string }>();
  const fy = useFinancialYear();
  const kind = (params.kind in REPORTS ? params.kind : 'calls') as Kind;
  const last = fy.isPast ? fy.lastMonth : monthOf(fy.today);
  const clamp = (m: string) => (m < fy.firstMonth ? fy.firstMonth : m > last ? last : m);
  const [picked, setPicked] = useState<string | null>(params.month ?? null);
  const month = clamp(picked ?? last);
  const Report = REPORTS[kind];
  return (
    <ScreenShell title={TITLES[kind].title} subtitle={TITLES[kind].subtitle}>
      <FyBanner />
      <InfoCard>
        <MonthStepper value={month} onChange={setPicked} min={fy.firstMonth} max={last} />
      </InfoCard>
      {params.kind in REPORTS ? <Report month={month} year={fy.year} /> : <Notice tone="danger">That report doesn’t exist.</Notice>}
    </ScreenShell>
  );
}
