'use client';

import type { ExpensePayoutRowDto, PayOutcomeDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate } from '@/lib/dates';
import { financialYearOf, financialYearRange } from '@/lib/financial-year';
import { formatDate, formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useExpensePayouts, usePayExpenses } from '../hooks/useExpenses';
import { bucketPaise, payoutMonths, payoutState, payoutTotals } from '../lib/payouts';

/**
 * The expense payout: one month's TA, DA and reimbursements per employee, paid on the payout day of the next month and apart from salary.
 * A month is the month the expenses were incurred. The due day only drives a flag; paying early or late is allowed.
 */
export function ExpensePayoutsScreen() {
  const readOnly = useIsReadOnly();
  const { year } = useFinancialYear();
  const today = istDate();
  const months = payoutMonths(financialYearRange(year ?? financialYearOf(today)).from, today);
  const { values, update } = useFilterParams(['month']);
  const month = months.includes(values.month) ? values.month : (months[0] ?? '');
  const [paying, setPaying] = useState<{ rows: ExpensePayoutRowDto[] } | null>(null);
  const [outcomes, setOutcomes] = useState<PayOutcomeDto[] | null>(null);

  const sheet = useExpensePayouts(month, month !== '');
  const rows = sheet.data?.rows ?? [];
  const totals = payoutTotals(rows);
  const owedRows = rows.filter((r) => r.unpaid.count > 0);
  const pay = usePayExpenses((result) => {
    setPaying(null);
    setOutcomes(result);
  });

  const columns: readonly Column<ExpensePayoutRowDto>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <p className="font-medium text-text">{r.userName || 'Unknown'}</p>
          <p className="text-xs text-text-subtle">{r.employeeCode}</p>
        </div>
      ),
    },
    {
      key: 'ta',
      header: 'TA',
      numeric: true,
      render: (r) => formatMoney(r.unpaid.taPaise + r.paid.taPaise),
    },
    {
      key: 'da',
      header: 'DA',
      numeric: true,
      render: (r) => formatMoney(r.unpaid.daPaise + r.paid.daPaise),
    },
    {
      key: 'reimb',
      header: 'Reimbursements',
      numeric: true,
      render: (r) => formatMoney(r.unpaid.reimbursementPaise + r.paid.reimbursementPaise),
    },
    {
      key: 'unpaid',
      header: 'To pay',
      numeric: true,
      render: (r) => <span className="font-semibold">{formatMoney(bucketPaise(r.unpaid))}</span>,
    },
    { key: 'paid', header: 'Paid', numeric: true, render: (r) => formatMoney(bucketPaise(r.paid)) },
    {
      key: 'status',
      header: 'Status',
      render: (r) => {
        const state = payoutState(r);
        return (
          <div className="flex flex-col gap-1">
            <Badge
              tone={
                state === 'paid'
                  ? 'success'
                  : state === 'partly'
                    ? 'accent'
                    : sheet.data?.overdue
                      ? 'danger'
                      : 'warning'
              }
            >
              {state === 'paid'
                ? 'Paid'
                : state === 'partly'
                  ? 'Partly paid'
                  : sheet.data?.overdue
                    ? 'Overdue'
                    : 'To pay'}
            </Badge>
            {r.lastPaidAt && state !== 'unpaid' ? (
              <span className="text-xs text-text-subtle">{formatDate(r.lastPaidAt)}</span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'w-28 text-right',
      render: (r) =>
        r.unpaid.count > 0 ? (
          <Button
            size="sm"
            disabled={readOnly}
            title={readOnly ? 'A past financial year is read-only' : undefined}
            onClick={() => setPaying({ rows: [r] })}
          >
            Pay
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Expense payouts"
        description="TA, DA and reimbursements, paid per month and apart from salary. A month is the month the expenses were incurred."
        actions={
          <Button
            disabled={readOnly || owedRows.length === 0}
            title={readOnly ? 'A past financial year is read-only' : undefined}
            onClick={() => setPaying({ rows: owedRows })}
          >
            {owedRows.length === 0 ? 'Nothing to pay' : `Pay all ${owedRows.length}`}
          </Button>
        }
      />

      {months.length === 0 ? (
        <Card>
          <p className="p-6 text-sm text-text-muted">
            This financial year has not started yet, so there are no expenses to pay.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="w-56">
              <Select
                aria-label="Month"
                value={month}
                options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
                onValueChange={(v) => update({ month: v })}
              />
            </div>
            {sheet.data ? (
              <Badge tone={sheet.data.overdue ? 'danger' : 'neutral'}>
                {sheet.data.overdue
                  ? `Overdue since ${formatDate(sheet.data.dueDate)}`
                  : `Due ${formatDate(sheet.data.dueDate)}`}
              </Badge>
            ) : null}
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label="Employees to pay"
              value={totals.owed}
              note={rows.length > 0 ? `of ${rows.length} with expenses` : undefined}
            />
            <StatTile label="To pay" value={formatMoney(totals.unpaidPaise)} />
            <StatTile label="Paid" value={formatMoney(totals.paidPaise)} />
          </div>

          <Card flat>
            <TopProgressBar active={sheet.isFetching && !sheet.isLoading} />
            <DataState
              isLoading={sheet.isLoading}
              error={sheet.error ? toErrorState(sheet.error, () => void sheet.refetch()) : null}
              isEmpty={rows.length === 0}
              empty={{
                title: `No accepted expenses for ${monthLabel(month)}`,
                description:
                  'Expenses appear here once the month has been approved by the manager and finalized by the Accountant, in Expenses.',
              }}
            >
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.userId} />
            </DataState>
          </Card>
        </>
      )}

      {paying ? (
        <Dialog
          open
          onOpenChange={(open) => !open && setPaying(null)}
          title={
            paying.rows.length === 1
              ? `Pay ${paying.rows[0]?.userName}`
              : `Pay ${paying.rows.length} employees`
          }
          description={`${formatMoney(paying.rows.reduce((sum, r) => sum + bucketPaise(r.unpaid), 0))} for ${monthLabel(month)}. This cannot be undone here.`}
          footer={
            <>
              <Button variant="secondary" disabled={pay.isPending} onClick={() => setPaying(null)}>
                Cancel
              </Button>
              <Button
                disabled={pay.isPending}
                onClick={() => pay.mutate({ month, userIds: paying.rows.map((r) => r.userId) })}
              >
                {pay.isPending ? 'Working…' : 'Mark paid'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-text-muted">
            Every accepted, unpaid expense of {monthLabel(month)} becomes paid, with you as who paid
            it and now as when. Paying again later pays nothing twice.
          </p>
        </Dialog>
      ) : null}
      {outcomes ? (
        <Dialog
          open
          onOpenChange={(open) => !open && setOutcomes(null)}
          title={`${outcomes.reduce((n, o) => n + o.paidCount, 0)} expenses marked paid`}
          description={`${formatMoney(outcomes.reduce((n, o) => n + o.paidPaise, 0))} across ${outcomes.filter((o) => o.paidCount > 0).length} employees.`}
          footer={<Button onClick={() => setOutcomes(null)}>Done</Button>}
        >
          <p className="text-sm text-text-muted">The sheet now shows each employee as paid.</p>
        </Dialog>
      ) : null}
    </>
  );
}
