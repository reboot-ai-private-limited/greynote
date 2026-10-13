'use client';

import type { ExpenseOverviewRowDto, FinalizeOutcomeDto } from '@greynote/contracts';
import { useState } from 'react';
import Link from 'next/link';
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
import { useSession } from '@/lib/auth/SessionProvider';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useExpenseOverview } from '../hooks/useExpenses';
import { canFinalize, overviewTotals, STAGE_LABEL, STAGE_TONE } from '../lib/expenseMonths';
import { FinalizeDialog } from './FinalizeDialog';
import { payoutMonths } from '../lib/payouts';

/**
 * Every field employee's expenses for one month, in one table: what they claimed, how much of it is accepted (its daily report is approved),
 * what is paid and where the month stands. "Review" opens the month day by day. Read only for now: HR edits, the Accountant finalizes and
 * pays are the next steps (decision-log 2026-10-13).
 */
export function ExpenseMonthsScreen() {
  const { year } = useFinancialYear();
  const today = istDate();
  const months = payoutMonths(financialYearRange(year ?? financialYearOf(today)).from, today);
  const { values, update } = useFilterParams(['month']);
  const month = months.includes(values.month) ? values.month : (months[0] ?? '');
  const sheet = useExpenseOverview(month, month !== '');
  const rows = sheet.data?.rows ?? [];
  const totals = overviewTotals(rows);
  const { user } = useSession();
  const readOnly = useIsReadOnly();
  const canClose = (user?.role === 'ACCOUNTANT' || user?.role === 'ADMIN') && month < today.slice(0, 7);
  const [finalizing, setFinalizing] = useState<{ userIds?: string[]; name?: string; count: number } | null>(null);
  const [outcomes, setOutcomes] = useState<FinalizeOutcomeDto[] | null>(null);

  const columns: readonly Column<ExpenseOverviewRowDto>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <Link href={`/expense-months/${r.userId}?month=${month}`} className="font-medium text-text">
            {r.userName || 'Unknown'}
          </Link>
          <p className="text-xs text-text-subtle">{r.employeeCode}</p>
        </div>
      ),
    },
    { key: 'ta', header: 'TA', numeric: true, render: (r) => formatMoney(r.taPaise) },
    { key: 'da', header: 'DA', numeric: true, render: (r) => formatMoney(r.daPaise) },
    { key: 'other', header: 'Other', numeric: true, render: (r) => formatMoney(r.otherPaise) },
    { key: 'total', header: 'Total', numeric: true, render: (r) => <span className="font-semibold">{formatMoney(r.totalPaise)}</span> },
    {
      key: 'accepted',
      header: 'Accepted',
      numeric: true,
      render: (r) => (
        <span title="The part whose daily report is approved: what a payout can pay" className={r.acceptedPaise < r.totalPaise ? 'text-warning-fg' : undefined}>
          {formatMoney(r.acceptedPaise)}
        </span>
      ),
    },
    { key: 'paid', header: 'Paid', numeric: true, render: (r) => formatMoney(r.paidPaise) },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <div className="flex flex-col gap-1">
          <Badge tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Badge>
          {r.flaggedRows > 0 ? <span className="text-xs text-warning-fg">{r.flaggedRows} route distance missing</span> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-44 text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {canClose && canFinalize(r.stage) ? (
            <Button size="sm" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setFinalizing({ userIds: [r.userId], name: r.userName, count: 1 })}>
              Finalize
            </Button>
          ) : null}
          <Link href={`/expense-months/${r.userId}?month=${month}`}>
            <Button variant="secondary" size="sm">
              Review
            </Button>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Expenses by month"
        description="Each employee's TA, DA and other claims for the month, with where it stands. Open a row to see every day."
        actions={
          canClose && totals.toFinalize > 0 ? (
            <Button disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setFinalizing({ count: totals.toFinalize })}>
              {`Finalize ${totals.toFinalize} approved`}
            </Button>
          ) : undefined
        }
      />
      {months.length === 0 ? (
        <Card>
          <p className="p-6 text-sm text-text-muted">This financial year has not started yet, so there are no expenses.</p>
        </Card>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="w-56">
              <Select aria-label="Month" value={month} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} onValueChange={(v) => update({ month: v })} />
            </div>
            {sheet.data ? <Badge tone="neutral">{`Payout due ${formatDate(sheet.data.payoutDueDate)}`}</Badge> : null}
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Claimed" value={formatMoney(totals.claimedPaise)} />
            <StatTile label="Accepted" value={formatMoney(totals.acceptedPaise)} note="Daily report approved" />
            <StatTile label="Paid" value={formatMoney(totals.paidPaise)} />
            <StatTile label="Waiting for approval" value={totals.waiting} note={`${totals.notSubmitted} not submitted · ${totals.toFinalize} ready to finalize`} tone={totals.waiting > 0 ? 'warning' : undefined} />
          </div>
          <Card flat>
            <TopProgressBar active={sheet.isFetching && !sheet.isLoading} />
            <DataState
              isLoading={sheet.isLoading}
              error={sheet.error ? toErrorState(sheet.error, () => void sheet.refetch()) : null}
              isEmpty={rows.length === 0}
              empty={{ title: `No field employees for ${monthLabel(month)}` }}
            >
              <DataTable columns={columns} rows={rows} rowKey={(r) => r.userId} />
            </DataState>
          </Card>
        </>
      )}
      {finalizing ? (
        <FinalizeDialog month={month} count={finalizing.count} onClose={() => setFinalizing(null)} onDone={setOutcomes} {...(finalizing.userIds ? { userIds: finalizing.userIds } : {})} {...(finalizing.name ? { name: finalizing.name } : {})} />
      ) : null}
      {outcomes ? (
        <Dialog
          open
          onOpenChange={(open) => !open && setOutcomes(null)}
          title={`${outcomes.filter((o) => o.result === 'FINALIZED').length} finalized`}
          footer={<Button onClick={() => setOutcomes(null)}>Done</Button>}
        >
          <p className="text-sm text-text-muted">
            {outcomes.some((o) => o.result === 'NOT_APPROVED') ? 'Some could not be finalized because the month is not approved yet. ' : ''}
            {outcomes.some((o) => o.result === 'ALREADY_FINALIZED') ? 'Some were already finalized. ' : ''}
            Finalized months are locked and can now be paid.
          </p>
        </Dialog>
      ) : null}
    </>
  );
}
