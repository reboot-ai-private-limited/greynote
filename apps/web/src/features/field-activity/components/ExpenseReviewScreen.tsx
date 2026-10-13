'use client';

import type { ExpenseReviewDayDto } from '@greynote/contracts';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate, formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useExpenseReview } from '../hooks/useExpenses';
import {
  DAY_KIND_LABEL,
  DAY_TYPE_LABEL,
  DCR_LABEL,
  DCR_TONE,
  isMissedReport,
  leaveLabel,
  MONTH_STATUS_LABEL,
  MONTH_STATUS_TONE,
  STATION_LABEL,
  WORKING_TYPE_LABEL,
} from '../lib/expenseMonths';

const money = (paise: number) => (paise === 0 ? <span className="text-text-subtle">—</span> : formatMoney(paise));

/**
 * One employee's month, day by day: what each day was (working, off, holiday, leave paid or unpaid), what was planned (work type, routes,
 * HQ / ex-station / out-station), whether the daily report was sent, and the TA, DA and other amounts. Read only for now.
 */
export function ExpenseReviewScreen({ userId }: { userId: string }) {
  const { values } = useFilterParams(['month']);
  const month = /^\d{4}-\d{2}$/.test(values.month) ? values.month : '';
  const review = useExpenseReview(userId, month, month !== '');
  const data = review.data;

  const columns: readonly Column<ExpenseReviewDayDto>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (d) => <span className="whitespace-nowrap font-medium">{formatDate(d.date)}</span>,
    },
    {
      key: 'day',
      header: 'Day',
      render: (d) =>
        d.leave ? (
          <Badge tone={d.leave.paid ? 'success' : 'danger'}>{leaveLabel(d.leave)}</Badge>
        ) : d.dayType === 'WORKING' ? (
          <span className="text-text-muted">{d.workingType ? WORKING_TYPE_LABEL[d.workingType] : 'No plan'}</span>
        ) : (
          <Badge>{DAY_TYPE_LABEL[d.dayType]}</Badge>
        ),
    },
    {
      key: 'station',
      header: 'Workstation',
      render: (d) => (
        <span>
          {d.station ? STATION_LABEL[d.station] : <span className="text-text-subtle">—</span>}
          {d.dayKind && DAY_KIND_LABEL[d.dayKind] ? <span className="ml-1 text-xs text-text-subtle">· {DAY_KIND_LABEL[d.dayKind]}</span> : null}
        </span>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      render: (d) => (d.routes.length > 0 ? d.routes.map((r) => r.name).join(', ') : <span className="text-text-subtle">—</span>),
    },
    {
      key: 'dcr',
      header: 'Daily report',
      render: (d) =>
        d.dayType === 'WORKING' || d.dcr !== 'NOT_SUBMITTED' ? (
          <Badge tone={isMissedReport(d) ? 'danger' : DCR_TONE[d.dcr]}>{DCR_LABEL[d.dcr]}</Badge>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
    {
      key: 'ta',
      header: 'TA',
      numeric: true,
      render: (d) => (
        <span className={d.distanceFlag ? 'text-warning-fg' : undefined} title={d.distanceFlag ? 'The route distance could not be worked out, so this is too low' : undefined}>
          {money(d.taPaise)}
        </span>
      ),
    },
    { key: 'da', header: 'DA', numeric: true, render: (d) => money(d.daPaise) },
    {
      key: 'other',
      header: 'Other',
      numeric: true,
      render: (d) => (d.others.length > 0 ? <span title={d.others.map((o) => `${formatMoney(o.amountPaise)}${o.remarks ? ` · ${o.remarks}` : ''}`).join('\n')}>{money(d.otherPaise)}</span> : money(d.otherPaise)),
    },
    { key: 'total', header: 'Total', numeric: true, render: (d) => <span className="font-semibold">{money(d.totalPaise)}</span> },
    {
      key: 'counted',
      header: '',
      render: (d) => (d.taDaAccepted === false ? <Badge tone="warning">Not counted</Badge> : null),
    },
  ];

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/expense-months${month ? `?month=${month}` : ''}`} className="text-text-muted hover:text-accent hover:underline">
          ← Expenses by month
        </Link>
      </p>
      <PageHeader
        title={data ? data.userName : 'Expenses'}
        description={data ? `${data.employeeCode} · ${monthLabel(data.month)}` : month === '' ? 'Choose a month from the list.' : undefined}
        actions={data ? <Badge tone={MONTH_STATUS_TONE[data.status]}>{MONTH_STATUS_LABEL[data.status]}</Badge> : undefined}
      />
      {month === '' ? (
        <Card>
          <p className="p-6 text-sm text-text-muted">No month chosen. Go back and open an employee from the list.</p>
        </Card>
      ) : (
        <DataState
          isLoading={review.isLoading}
          error={review.error ? toErrorState(review.error, () => void review.refetch()) : null}
          isEmpty={!data}
          empty={{ title: 'Nothing found for this month' }}
        >
          {data ? (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Claimed" value={formatMoney(data.totals.totalPaise)} note={`TA ${formatMoney(data.totals.taPaise)} · DA ${formatMoney(data.totals.daPaise)} · Other ${formatMoney(data.totals.otherPaise)}`} />
                <StatTile label="Accepted" value={formatMoney(data.acceptedPaise)} note="Daily report approved" tone={data.acceptedPaise < data.totals.totalPaise ? 'warning' : undefined} />
                <StatTile label="Paid" value={formatMoney(data.paidPaise)} />
                <StatTile label="Leave" value={`${data.leave.paidDays + data.leave.unpaidDays} days`} note={`${data.leave.paidDays} paid · ${data.leave.unpaidDays} unpaid`} tone={data.leave.unpaidDays > 0 ? 'danger' : undefined} />
              </div>
              <Card flat>
                <DataTable columns={columns} rows={data.days} rowKey={(d) => d.date} />
              </Card>
              <p className="mt-3 text-xs text-text-subtle">
                A day with no daily report claims nothing. "Not counted": the day's report is not approved, so its TA and DA are claimed but cannot be paid yet.
              </p>
            </>
          ) : null}
        </DataState>
      )}
    </>
  );
}
