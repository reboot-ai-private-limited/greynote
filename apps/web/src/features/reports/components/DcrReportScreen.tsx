'use client';

import type { DcrMonthDto, DcrMrRowDto } from '@greynote/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv } from '@/lib/csv';
import { istDate } from '@/lib/dates';
import { financialYearLabel, financialYearOf } from '@/lib/financial-year';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useDcrYear } from '../hooks/useDcrReport';
import {
  callsPerDayText,
  dcrDefaultMonth,
  dcrEmployeesCsv,
  dcrMonthFilename,
  dcrMonthsCsv,
  dcrRowsOfMonth,
  dcrYearFilename,
  latePercent,
} from '../lib/dcr';
import { monthTick } from '../lib/salesChart';
import { DcrCoverageDialog } from './DcrCoverageDialog';
import { GeofenceBar } from './GeofenceBar';

const n = (v: number): string => v.toLocaleString('en-IN');

/**
 * What the field force reported, for the financial year in view (sign-off K27, K28: calls only): per month and per employee the reported days, doctor
 * and chemist calls, follow-ups, calls per reported day, days submitted late, and how the server's geofence judged the calls; and, for an employee,
 * the assigned doctors they did not call on. Only submitted or approved reports count. Missed days are on the Attendance screen.
 */
export function DcrReportScreen() {
  const { values, update } = useFilterParams(['month']);
  const { year } = useFinancialYear();
  const fy = year ?? financialYearOf(istDate());
  const query = useDcrYear(fy);
  const report = query.data;
  const months = report?.months ?? [];
  const started = months.filter((m) => m.state !== 'FUTURE');
  const selected = started.find((m) => m.month === values.month)?.month ?? dcrDefaultMonth(months);
  const rows = report ? dcrRowsOfMonth(report, selected) : [];
  const [coverage, setCoverage] = useState<{ userId: string; month: string } | null>(null);

  const monthColumns: readonly Column<DcrMonthDto>[] = [
    {
      key: 'month',
      header: 'Month',
      render: (m) => (
        <button
          type="button"
          className={
            m.month === selected
              ? 'font-semibold text-accent'
              : 'font-medium text-text hover:text-accent hover:underline'
          }
          onClick={() => update({ month: m.month })}
        >
          {monthTick(m.month)}
        </button>
      ),
    },
    { key: 'employees', header: 'Employees', numeric: true, render: (m) => m.employees },
    { key: 'days', header: 'Days reported', numeric: true, render: (m) => n(m.reportedDays) },
    { key: 'doctor', header: 'Doctor calls', numeric: true, render: (m) => n(m.doctorCalls) },
    { key: 'chemist', header: 'Chemist calls', numeric: true, render: (m) => n(m.chemistCalls) },
    { key: 'followups', header: 'Follow-ups', numeric: true, render: (m) => n(m.followups) },
    { key: 'perDay', header: 'Calls per day', numeric: true, render: (m) => callsPerDayText(m) },
    {
      key: 'late',
      header: 'Late',
      numeric: true,
      render: (m) =>
        m.lateDays > 0 ? <span className="text-warning-fg">{n(m.lateDays)}</span> : '0',
    },
    {
      key: 'notInPlan',
      header: 'Not in plan',
      numeric: true,
      render: (m) =>
        m.notInPlan > 0 ? <span className="text-warning-fg">{n(m.notInPlan)}</span> : '0',
    },
    { key: 'geofence', header: 'Geofence', render: (m) => <GeofenceBar figures={m} /> },
  ];

  const mrColumns: readonly Column<DcrMrRowDto>[] = [
    {
      key: 'mr',
      header: 'Employee',
      render: (r) => (
        <span className="font-medium">
          {r.mr.name} <span className="font-normal text-text-subtle">{r.mr.employeeCode}</span>
        </span>
      ),
    },
    { key: 'days', header: 'Days reported', numeric: true, render: (r) => n(r.reportedDays) },
    { key: 'doctor', header: 'Doctor calls', numeric: true, render: (r) => n(r.doctorCalls) },
    { key: 'chemist', header: 'Chemist calls', numeric: true, render: (r) => n(r.chemistCalls) },
    { key: 'followups', header: 'Follow-ups', numeric: true, render: (r) => n(r.followups) },
    { key: 'perDay', header: 'Calls per day', numeric: true, render: (r) => callsPerDayText(r) },
    {
      key: 'late',
      header: 'Late',
      numeric: true,
      render: (r) => (r.lateDays > 0 ? <Badge tone="warning">{`${r.lateDays} late`}</Badge> : '0'),
    },
    {
      key: 'notInPlan',
      header: 'Not in plan',
      numeric: true,
      render: (r) => (r.notInPlan > 0 ? <Badge tone="warning">{n(r.notInPlan)}</Badge> : '0'),
    },
    { key: 'geofence', header: 'Geofence', render: (r) => <GeofenceBar figures={r} /> },
    {
      key: 'coverage',
      header: '',
      className: 'text-right',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCoverage({ userId: r.mr.id, month: r.month })}
          aria-label={`Doctors ${r.mr.name} did not visit in ${monthLabel(r.month)}`}
        >
          Doctors not visited
        </Button>
      ),
    },
  ];

  const t = report?.totals;
  const late = t ? latePercent(t) : null;
  return (
    <>
      <PageHeader
        title="Daily reports"
        description={`What the field force reported, ${financialYearLabel(fy)}: days, calls, how the geofence judged them, and who was late. Only submitted or approved reports count.`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/attendance" className="text-sm text-accent hover:underline">
              Missed days on Attendance
            </Link>
            <Button
              variant="secondary"
              disabled={!report}
              onClick={() => report && downloadCsv(dcrYearFilename(fy), dcrMonthsCsv(report))}
            >
              Download CSV
            </Button>
          </div>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Days reported"
          value={n(t?.reportedDays ?? 0)}
          note={late === null ? undefined : `${late}% submitted late`}
        />
        <StatTile
          label="Calls"
          value={n(t?.calls ?? 0)}
          note={`${n(t?.doctorCalls ?? 0)} doctor · ${n(t?.chemistCalls ?? 0)} chemist`}
        />
        <StatTile label="Calls per reported day" value={t ? callsPerDayText(t) : '—'} />
        <StatTile
          label="Calls the geofence could not confirm"
          value={n(t?.unconfirmed ?? 0)}
          note="failed or unverified, not overridden"
          tone={t && t.unconfirmed > 0 ? 'warning' : undefined}
        />
        <StatTile
          label="Doctor calls not in plan"
          value={n(t?.notInPlan ?? 0)}
          note="a doctor who was not on the day’s plan"
          tone={t && t.notInPlan > 0 ? 'warning' : undefined}
        />
      </div>

      <Card flat title="By month" description="Click a month to see its employees below.">
        <DataState
          isLoading={query.isLoading}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={started.length === 0}
          empty={{ title: 'No month of this financial year has started yet' }}
        >
          <DataTable columns={monthColumns} rows={started} rowKey={(m) => m.month} />
        </DataState>
      </Card>

      {selected ? (
        <Card
          flat
          title={`${monthLabel(selected)}: by employee`}
          description="Most calls first. Open an employee's doctors who were not called on."
          actions={
            <Button
              variant="secondary"
              size="sm"
              disabled={rows.length === 0}
              onClick={() => downloadCsv(dcrMonthFilename(selected), dcrEmployeesCsv(rows))}
            >
              Download CSV
            </Button>
          }
          className="mt-6"
        >
          <DataState
            isLoading={query.isLoading}
            error={null}
            isEmpty={rows.length === 0}
            empty={{
              title: 'No reported days this month',
              description: 'Days appear once their daily report is submitted.',
            }}
          >
            <DataTable columns={mrColumns} rows={rows} rowKey={(r) => r.mr.id} />
          </DataState>
        </Card>
      ) : null}

      {coverage ? (
        <DcrCoverageDialog
          userId={coverage.userId}
          month={coverage.month}
          onClose={() => setCoverage(null)}
        />
      ) : null}
    </>
  );
}
