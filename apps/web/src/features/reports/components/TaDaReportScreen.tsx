'use client';

import type { TaDaMonthDto, TaDaMrRowDto } from '@greynote/contracts';
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
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useTaDaYear } from '../hooks/useTaDaReport';
import {
  defaultMonth,
  paidPercent,
  rowsOfMonth,
  taDaEmployeesCsv,
  taDaMonthFilename,
  taDaMonthsCsv,
  taDaYearFilename,
} from '../lib/taDa';
import { monthTick } from '../lib/salesChart';
import { TaDaDaysDialog } from './TaDaDaysDialog';

const money = (paise: number): string => formatMoney(paise);

/**
 * What the field force claimed for travel and daily allowance, for the financial year in view (sign-off K27, K28): by month, then each employee's
 * month, then their days. Only accepted expenses — past the manager and not sent back — count, the same ones the Accountant pays; this report only
 * reads, and paying is done on the Expense payouts screen.
 */
export function TaDaReportScreen() {
  const { values, update } = useFilterParams(['month']);
  const { year } = useFinancialYear();
  const fy = year ?? financialYearOf(istDate());
  const query = useTaDaYear(fy);
  const report = query.data;
  const months = report?.months ?? [];
  const started = months.filter((m) => m.state !== 'FUTURE');
  const selected = started.find((m) => m.month === values.month)?.month ?? defaultMonth(months);
  const rows = report ? rowsOfMonth(report, selected) : [];
  const [open, setOpen] = useState<{ userId: string; month: string } | null>(null);

  const monthColumns: readonly Column<TaDaMonthDto>[] = [
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
    { key: 'ta', header: 'TA', numeric: true, render: (m) => money(m.taPaise) },
    { key: 'da', header: 'DA', numeric: true, render: (m) => money(m.daPaise) },
    {
      key: 'other',
      header: 'Reimbursed',
      numeric: true,
      render: (m) => money(m.reimbursementPaise),
    },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      render: (m) => <span className="font-medium">{money(m.totalPaise)}</span>,
    },
    { key: 'paid', header: 'Paid', numeric: true, render: (m) => money(m.paidPaise) },
    {
      key: 'unpaid',
      header: 'Unpaid',
      numeric: true,
      render: (m) =>
        m.unpaidPaise > 0 ? (
          <span className="font-medium text-warning-fg">{money(m.unpaidPaise)}</span>
        ) : (
          money(0)
        ),
    },
    {
      key: 'share',
      header: 'Paid share',
      render: (m) =>
        m.totalPaise > 0 ? (
          <PaidBar percent={paidPercent(m)} />
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
  ];

  const mrColumns: readonly Column<TaDaMrRowDto>[] = [
    {
      key: 'mr',
      header: 'Employee',
      render: (r) => (
        <button
          type="button"
          className="text-left font-medium text-text hover:text-accent hover:underline"
          onClick={() => setOpen({ userId: r.mr.id, month: r.month })}
        >
          {r.mr.name} <span className="font-normal text-text-subtle">{r.mr.employeeCode}</span>
        </button>
      ),
    },
    { key: 'ta', header: 'TA', numeric: true, render: (r) => money(r.taPaise) },
    { key: 'da', header: 'DA', numeric: true, render: (r) => money(r.daPaise) },
    {
      key: 'other',
      header: 'Reimbursed',
      numeric: true,
      render: (r) => money(r.reimbursementPaise),
    },
    {
      key: 'total',
      header: 'Total',
      numeric: true,
      render: (r) => <span className="font-medium">{money(r.totalPaise)}</span>,
    },
    { key: 'paid', header: 'Paid', numeric: true, render: (r) => money(r.paidPaise) },
    {
      key: 'unpaid',
      header: 'Unpaid',
      numeric: true,
      render: (r) =>
        r.unpaidPaise > 0 ? (
          <span className="font-medium text-warning-fg">{money(r.unpaidPaise)}</span>
        ) : (
          money(0)
        ),
    },
    {
      key: 'flag',
      header: '',
      render: (r) =>
        r.flaggedRows > 0 ? (
          <Badge tone="warning">{`${r.flaggedRows} distance not calculated`}</Badge>
        ) : null,
    },
  ];

  const totals = report?.totals;
  return (
    <>
      <PageHeader
        title="TA and DA"
        description={`Accepted travel, daily allowance and reimbursements, ${financialYearLabel(fy)}, by the day reported. Only what is past the manager and not sent back counts.`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/expenses" className="text-sm text-accent hover:underline">
              Pay on Expense payouts
            </Link>
            <Button
              variant="secondary"
              disabled={!report}
              onClick={() => report && downloadCsv(taDaYearFilename(fy), taDaMonthsCsv(report))}
            >
              Download CSV
            </Button>
          </div>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="TA, year to date" value={money(totals?.taPaise ?? 0)} />
        <StatTile label="DA, year to date" value={money(totals?.daPaise ?? 0)} />
        <StatTile
          label="Paid"
          value={money(totals?.paidPaise ?? 0)}
          note={`of ${money(totals?.totalPaise ?? 0)} accepted`}
          tone="success"
        />
        <StatTile
          label="Unpaid"
          value={money(totals?.unpaidPaise ?? 0)}
          note={
            totals && totals.flaggedRows > 0
              ? `${totals.flaggedRows} TA rows with distance not calculated`
              : 'accepted, waiting to be paid'
          }
          tone={totals && totals.unpaidPaise > 0 ? 'warning' : undefined}
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
          description="Click an employee to see their days."
          actions={
            <Button
              variant="secondary"
              size="sm"
              disabled={rows.length === 0}
              onClick={() => downloadCsv(taDaMonthFilename(selected), taDaEmployeesCsv(rows))}
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
              title: 'No accepted expenses this month',
              description: 'Claims appear once their daily report is approved.',
            }}
          >
            <DataTable columns={mrColumns} rows={rows} rowKey={(r) => r.mr.id} />
          </DataState>
        </Card>
      ) : null}

      {open ? (
        <TaDaDaysDialog userId={open.userId} month={open.month} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

/** A thin bar for the paid share of a month, with the percentage in words beside it. */
function PaidBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        role="img"
        aria-label={`${percent}% paid`}
        className="h-2 w-24 overflow-hidden rounded-full bg-surface-hover"
      >
        <div className="h-full bg-success" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs tabular-nums text-text-muted">{percent}%</span>
    </div>
  );
}
