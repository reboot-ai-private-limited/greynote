'use client';

import type { ExpenseAuditRowDto, ExpensePaymentStatus } from '@greynote/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { EmployeeFilter } from '@/features/people/components/EmployeePickerField';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv } from '@/lib/csv';
import { istDate } from '@/lib/dates';
import { monthToDate, rangeError } from '@/lib/dateRange';
import { formatDate, formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useExpenseAudit } from '../hooks/useExpenses';
import {
  EXPENSE_TYPE_LABEL,
  PAYMENT_LABEL,
  PAYMENT_TONE,
  auditTotals,
  expensesCsv,
  expensesFilename,
  flaggedRows,
  isCapped,
  payableRows,
  sumPaise,
} from '../lib/expenses';
import { MarkPaidDialog } from './MarkPaidDialog';

type StatusFilter = ExpensePaymentStatus | 'all';
const STATUS_OPTIONS = [
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'all', label: 'Unpaid and paid' },
];

/**
 * The Accountant's audit: expenses whose daily report is past the manager and has not been sent back, unpaid first. The range
 * defaults to this month so far, because the API wants one and returns at most 500 rows.
 */
export function ExpensesScreen() {
  const { values, update } = useFilterParams(['from', 'to', 'userId', 'status']);
  const defaults = monthToDate(istDate());
  const from = values.from || defaults.from;
  const to = values.to || defaults.to;
  const status: StatusFilter = values.status === 'PAID' || values.status === 'all' ? values.status : 'UNPAID';
  const range = rangeError(from, to);
  const readOnly = useIsReadOnly();

  const query = useExpenseAudit(
    { from, to, ...(values.userId && { userId: values.userId }), ...(status !== 'all' && { paymentStatus: status }) },
    !range,
  );
  const rows = query.data ?? [];
  const totals = auditTotals(rows);
  const flagged = flaggedRows(rows).filter((r) => r.paymentStatus === 'UNPAID');

  // Selection: only rows that can be paid, and only the ones in front of the person. It clears when the filters change.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [paying, setPaying] = useState<ExpenseAuditRowDto[] | null>(null);
  const filterKey = `${from}|${to}|${values.userId}|${status}`;
  useEffect(() => setSelected(new Set()), [filterKey]);
  const payable = payableRows(rows);
  const chosen = payable.filter((r) => selected.has(r.id));
  const allChosen = payable.length > 0 && chosen.length === payable.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns: readonly Column<ExpenseAuditRowDto>[] = [
    {
      key: 'select',
      header: '',
      className: 'w-10',
      render: (r) =>
        r.paymentStatus === 'UNPAID' ? (
          <input
            type="checkbox"
            checked={selected.has(r.id)}
            onChange={() => toggle(r.id)}
            disabled={readOnly}
            aria-label={`Select ${EXPENSE_TYPE_LABEL[r.type]} for ${r.userName}`}
            className="size-4 rounded border-border-strong accent-[var(--color-accent)]"
          />
        ) : null,
    },
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <Link href={`/employees/${r.userId}`} className="font-medium text-text hover:text-accent hover:underline">
            {r.userName || 'Unknown'}
          </Link>
          <div className="text-xs text-text-subtle">{r.employeeCode}</div>
        </div>
      ),
    },
    { key: 'day', header: 'Report day', render: (r) => formatDate(r.reportDate) },
    {
      key: 'type',
      header: 'Expense',
      render: (r) => (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {EXPENSE_TYPE_LABEL[r.type]}
            {r.source === 'AUTO' ? <Badge tone="neutral">Calculated</Badge> : null}
            {r.distanceFlag ? <Badge tone="warning">Distance not calculated</Badge> : null}
          </div>
          {r.remarks ? <div className="text-xs text-text-subtle">{r.remarks}</div> : null}
        </div>
      ),
    },
    { key: 'amount', header: 'Amount', numeric: true, render: (r) => <span className="font-medium">{formatMoney(r.amountPaise)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <div>
          <Badge tone={PAYMENT_TONE[r.paymentStatus]}>{PAYMENT_LABEL[r.paymentStatus]}</Badge>
          {r.paidAt ? <div className="mt-1 text-xs text-text-subtle">{formatDate(r.paidAt)}</div> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-28 text-right',
      render: (r) =>
        r.paymentStatus === 'UNPAID' ? (
          <Button size="sm" variant="secondary" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setPaying([r])}>
            Mark paid
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Claims the manager has accepted, ready to audit and pay. Payroll counts only what you mark paid, in the month you paid it."
        actions={
          <Button variant="secondary" disabled={rows.length === 0} onClick={() => downloadCsv(expensesFilename(from, to), expensesCsv(rows))}>
            Download CSV
          </Button>
        }
      />

      {/* A tile appears only when the list holds its rows: under "Unpaid", a Paid figure of ₹0 would be wrong, not zero. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {status !== 'PAID' ? <StatTile label="Still to pay" value={formatMoney(totals.unpaidPaise)} note={`${totals.unpaidCount} ${totals.unpaidCount === 1 ? 'claim' : 'claims'}`} {...(totals.unpaidCount > 0 ? { tone: 'warning' as const } : {})} /> : null}
        {status !== 'UNPAID' ? <StatTile label="Paid" value={formatMoney(totals.paidPaise)} note={`${totals.paidCount} ${totals.paidCount === 1 ? 'claim' : 'claims'}`} /> : null}
        {status !== 'PAID' ? <StatTile
          label="Low travel allowance"
          value={flagged.length}
          note={flagged.length > 0 ? 'Distance not calculated: check before paying' : 'None'}
          {...(flagged.length > 0 ? { tone: 'warning' as const } : {})}
        /> : null}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <label htmlFor="expenses-from">Report day from</label>
            <Input id="expenses-from" type="date" value={from} onChange={(e) => update({ from: e.target.value })} className="w-40" />
            <label htmlFor="expenses-to">to</label>
            <Input id="expenses-to" type="date" value={to} onChange={(e) => update({ to: e.target.value })} className="w-40" aria-invalid={range ? true : undefined} />
          </div>
          <EmployeeFilter allLabel="Any employee" value={values.userId} onChange={(v) => update({ userId: v })} />
          <div className="w-44">
            <Select aria-label="Payment status" value={status} options={STATUS_OPTIONS} onValueChange={(v) => update({ status: v === 'UNPAID' ? '' : v })} />
          </div>
          {values.from || values.to || values.userId || values.status ? (
            <Button variant="ghost" size="sm" onClick={() => update({ from: '', to: '', userId: '', status: '' })}>
              Reset
            </Button>
          ) : null}
          {range ? (
            <p role="alert" className="basis-full text-[13px] text-danger-fg">
              {range}
            </p>
          ) : null}
        </div>
        {payable.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
            <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => setSelected(allChosen ? new Set() : new Set(payable.map((r) => r.id)))}>
              {allChosen ? 'Clear selection' : `Select all ${payable.length} unpaid`}
            </Button>
            <span className="text-sm text-text-muted" aria-live="polite">
              {chosen.length === 0 ? 'Select claims to pay them together.' : `${chosen.length} selected · ${formatMoney(sumPaise(chosen))}`}
            </span>
            {chosen.length > 0 ? (
              <Button size="sm" disabled={readOnly} onClick={() => setPaying(chosen)}>
                Mark selected paid
              </Button>
            ) : null}
          </div>
        ) : null}
        <TopProgressBar active={query.isFetching && !query.isLoading} />
        {isCapped(rows) ? (
          <p role="status" className="border-t border-border bg-warning-bg px-5 py-3 text-sm text-warning-fg">
            Showing the first 500. There may be more: narrow the dates or pick an employee, so the totals above are complete.
          </p>
        ) : null}
        <DataState
          isLoading={!range && query.isLoading}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={!range && rows.length === 0}
          empty={{ title: 'No expenses', description: 'Nothing accepted by a manager matches these filters.' }}
        >
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
        </DataState>
      </Card>
      {paying ? (
        <MarkPaidDialog
          rows={paying}
          onClose={() => setPaying(null)}
          onFinished={(paid) => setSelected((prev) => new Set([...prev].filter((id) => !paid.includes(id))))}
        />
      ) : null}
    </>
  );
}
