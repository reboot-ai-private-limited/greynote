'use client';

import type { ExpenseOverviewRowDto, FinalizeOutcomeDto, PayOutcomeDto } from '@greynote/contracts';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { StatTile } from '@/components/ui/StatTile';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate } from '@/lib/dates';
import { financialYearOf, financialYearRange } from '@/lib/financial-year';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSession } from '@/lib/auth/SessionProvider';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useExpenseOverview, usePayExpenses } from '../hooks/useExpenses';
import { canFinalize, overviewTotals, STAGE_LABEL, STAGE_TONE } from '../lib/expenseMonths';
import { FinalizeDialog } from './FinalizeDialog';
import { GrantLateExpenseDialog } from './GrantLateExpenseDialog';
import { LateExpensesScreen } from './LateExpensesScreen';
import { payoutMonths } from '../lib/payouts';

/**
 * Expenses, in one place (decision-log 2026-10-13): every field employee's month in one table: what they claimed, how much of it is accepted
 * (its daily report is approved), what is paid and where the month stands (Not submitted, Waiting for approval, Approved, Finalized, Paid).
 * "Review" opens the month day by day, where HR changes amounts. The Accountant finalizes approved months and pays finalized ones here, and
 * Admin allows a month through late from its row. The second tab lists the late exceptions.
 */
export function ExpenseMonthsScreen() {
  const { year } = useFinancialYear();
  const today = istDate();
  const months = payoutMonths(financialYearRange(year ?? financialYearOf(today)).from, today);
  const { values, update } = useFilterParams(['month', 'tab']);
  const tab = values.tab === 'late' ? 'late' : 'months';
  const month = months.includes(values.month) ? values.month : (months[0] ?? '');
  const sheet = useExpenseOverview(month, month !== '');
  const rows = sheet.data?.rows ?? [];
  const totals = overviewTotals(rows);
  const { user } = useSession();
  const readOnly = useIsReadOnly();
  const canClose = (user?.role === 'ACCOUNTANT' || user?.role === 'ADMIN') && month < today.slice(0, 7);
  const [finalizing, setFinalizing] = useState<{ userIds?: string[]; name?: string; count: number } | null>(null);
  const [outcomes, setOutcomes] = useState<FinalizeOutcomeDto[] | null>(null);
  const [paying, setPaying] = useState<ExpenseOverviewRowDto[] | null>(null);
  const [paid, setPaid] = useState<PayOutcomeDto[] | null>(null);
  const [allowing, setAllowing] = useState<ExpenseOverviewRowDto | null>(null);
  const pay = usePayExpenses((result) => {
    setPaying(null);
    setPaid(result);
  });
  const canPay = user?.role === 'ACCOUNTANT' || user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN';
  const toPay = (r: ExpenseOverviewRowDto) => (r.stage === 'FINALIZED' ? Math.max(r.acceptedPaise - r.paidPaise, 0) : 0);
  const owed = rows.filter((r) => toPay(r) > 0);

  const columns: readonly Column<ExpenseOverviewRowDto>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <Link href={`/expenses/${r.userId}?month=${month}`} className="font-medium text-text">
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
    { key: 'topay', header: 'To pay', numeric: true, render: (r) => (toPay(r) > 0 ? <span className="font-semibold">{formatMoney(toPay(r))}</span> : <span className="text-text-subtle">—</span>) },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <div className="flex flex-col gap-1">
          <Badge tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Badge>
          {r.lateGrant ? <span className="text-xs text-accent">Late allowed until {formatDateTime(r.lateGrant.until)}</span> : null}
          {r.lateNeeded ? <span className="text-xs text-danger-fg">{r.lateNeeded === 'SUBMIT' ? 'Send deadline passed' : 'Approval deadline passed'}</span> : null}
          {r.flaggedRows > 0 ? <span className="text-xs text-warning-fg">{r.flaggedRows} route distance missing</span> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-64 text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {canClose && canFinalize(r.stage) ? (
            <Button size="sm" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setFinalizing({ userIds: [r.userId], name: r.userName, count: 1 })}>
              Finalize
            </Button>
          ) : null}
          {canPay && toPay(r) > 0 ? (
            <Button size="sm" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setPaying([r])}>
              Pay
            </Button>
          ) : null}
          {isAdmin && r.lateNeeded ? (
            <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => setAllowing(r)}>
              Allow late
            </Button>
          ) : null}
          <Link href={`/expenses/${r.userId}?month=${month}`}>
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
        title="Expenses"
        description="Each employee's TA, DA and other claims for the month, with where it stands. Open a row to see every day, finalize approved months and pay them."
        actions={
          tab === 'months' ? (
            <div className="flex items-center gap-2">
              {canClose && totals.toFinalize > 0 ? (
                <Button disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setFinalizing({ count: totals.toFinalize })}>
                  {`Finalize ${totals.toFinalize} approved`}
                </Button>
              ) : null}
              {canPay && owed.length > 0 ? (
                <Button disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setPaying(owed)}>
                  {`Pay all ${owed.length} finalized`}
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      />
      {isAdmin ? (
        <Tabs value={tab} onValueChange={(v) => update({ tab: v === 'late' ? 'late' : '' })} className="mb-6">
          <TabsList>
            <TabsTrigger value="months">Months</TabsTrigger>
            <TabsTrigger value="late">Late exceptions</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {tab === 'late' && isAdmin ? <LateExpensesScreen embedded /> : null}
      {tab === 'late' && isAdmin ? null : months.length === 0 ? (
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
      {allowing && allowing.lateNeeded ? <GrantLateExpenseDialog onClose={() => setAllowing(null)} initial={{ userId: allowing.userId, month, phase: allowing.lateNeeded }} /> : null}
      {paying ? (
        <Dialog
          open
          onOpenChange={(open) => !open && setPaying(null)}
          title={paying.length === 1 ? `Pay ${paying[0]?.userName}` : `Pay ${paying.length} employees`}
          description={`${formatMoney(paying.reduce((sum, r) => sum + toPay(r), 0))} for ${monthLabel(month)}. This cannot be undone here.`}
          footer={
            <>
              <Button variant="secondary" disabled={pay.isPending} onClick={() => setPaying(null)}>
                Cancel
              </Button>
              <Button disabled={pay.isPending} onClick={() => pay.mutate({ month, userIds: paying.map((r) => r.userId) })}>
                {pay.isPending ? 'Working…' : 'Mark paid'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-text-muted">Every accepted, unpaid expense of {monthLabel(month)} for these finalized months becomes paid, with you as who paid it and now as when.</p>
        </Dialog>
      ) : null}
      {paid ? (
        <Dialog
          open
          onOpenChange={(open) => !open && setPaid(null)}
          title={`${paid.reduce((n, o) => n + o.paidCount, 0)} expenses marked paid`}
          description={`${formatMoney(paid.reduce((n, o) => n + o.paidPaise, 0))} across ${paid.filter((o) => o.paidCount > 0).length} employees.`}
          footer={<Button onClick={() => setPaid(null)}>Done</Button>}
        >
          <p className="text-sm text-text-muted">The table now shows each of them as paid.</p>
        </Dialog>
      ) : null}
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
