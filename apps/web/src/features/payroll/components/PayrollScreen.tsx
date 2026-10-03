'use client';

import type { GenerateOutcomeDto, PayrollRunDto } from '@greynote/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { useExpenseAudit } from '@/features/field-activity/hooks/useExpenses';
import { auditTotals } from '@/features/field-activity/lib/expenses';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv } from '@/lib/csv';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { useGenerate, usePayrollMonth } from '../hooks/usePayroll';
import { endedMonthsInYear, monthBounds, monthLabel, monthState, payrollCsv, payrollFilename, runTotals } from '../lib/payroll';
import { GenerateDialog } from './GenerateDialog';
import { GenerateResultDialog } from './GenerateResultDialog';

/** One month's payroll sheet: generate it from what was paid, review it, and (next) lock it. */
export function PayrollScreen() {
  const readOnly = useIsReadOnly();
  const { year } = useFinancialYear();
  const today = istDate();
  // The list is scoped to the financial year in view and refuses a month outside it.
  const months = endedMonthsInYear(year ?? financialYearOf(today), today);
  const { values, update } = useFilterParams(['month']);
  const month = months.includes(values.month) ? values.month : (months[0] ?? '');
  const [generating, setGenerating] = useState<{ employee?: PayrollRunDto } | null>(null);
  const [outcomes, setOutcomes] = useState<GenerateOutcomeDto[] | null>(null);

  const sheet = usePayrollMonth(month, month !== '');
  const runs = sheet.data ?? [];
  const totals = runTotals(runs);
  const state = monthState(runs);
  const generate = useGenerate((result) => {
    setGenerating(null);
    setOutcomes(result);
  });

  // Claims accepted for this month's reports but not yet paid are not in the sheet, and the Accountant should know how much.
  const bounds = month ? monthBounds(month) : { from: '', to: '' };
  const unpaid = useExpenseAudit({ ...bounds, paymentStatus: 'UNPAID' }, month !== '');
  const unpaidTotals = auditTotals(unpaid.data ?? []);

  const columns: readonly Column<PayrollRunDto>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (r) => (
        <div>
          <Link href={`/employees/${r.userId}`} className="font-medium text-text hover:text-accent hover:underline">
            {r.userName || 'Unknown'}
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-subtle">
            {r.employeeCode}
            {r.joinedInMonth ? <Badge tone="accent">Joined this month</Badge> : null}
          </div>
        </div>
      ),
    },
    { key: 'base', header: 'Base', numeric: true, render: (r) => formatMoney(r.baseSalaryPaise) },
    { key: 'taDa', header: 'TA + DA paid', numeric: true, render: (r) => formatMoney(r.totalTaDaPaise) },
    { key: 'reimb', header: 'Reimbursed', numeric: true, render: (r) => formatMoney(r.reimbursementPaise) },
    { key: 'leave', header: 'Unpaid leave', numeric: true, render: (r) => (r.unpaidLeaveDays === 0 ? '—' : `${r.unpaidLeaveDays} d · −${formatMoney(r.leaveDeductionPaise)}`) },
    { key: 'net', header: 'Net payable', numeric: true, render: (r) => <span className="font-semibold">{formatMoney(r.netPayablePaise)}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'FINALIZED' ? 'success' : 'warning'}>{r.status === 'FINALIZED' ? 'Finalized' : 'Draft'}</Badge> },
    {
      key: 'actions',
      header: '',
      className: 'w-32 text-right',
      render: (r) =>
        r.status === 'DRAFT' ? (
          <Button size="sm" variant="secondary" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setGenerating({ employee: r })}>
            Regenerate
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Payroll"
        description="A sheet per month for every active field employee: base salary plus what was paid in the month, less unpaid leave."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={runs.length === 0} onClick={() => downloadCsv(payrollFilename(month), payrollCsv(runs))}>
              Download CSV
            </Button>
            <Button disabled={readOnly || month === ''} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setGenerating({})}>
              {state === 'none' ? 'Generate sheet' : 'Regenerate drafts'}
            </Button>
          </div>
        }
      />

      {months.length === 0 ? (
        <Card>
          <p className="p-6 text-sm text-text-muted">
            No month of this financial year has ended yet. Payroll can be generated once a month is over. To work on an earlier month, choose its
            financial year at the top.
          </p>
        </Card>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="w-56">
              <Select aria-label="Month" value={month} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} onValueChange={(v) => update({ month: v })} />
            </div>
            {state !== 'none' ? (
              <Badge tone={state === 'final' ? 'success' : 'warning'}>{state === 'final' ? 'Finalized' : `${totals.drafts} ${totals.drafts === 1 ? 'draft' : 'drafts'} to finalize`}</Badge>
            ) : null}
          </div>

          {unpaidTotals.unpaidCount > 0 ? (
            <p role="status" className="mb-6 rounded-lg border border-warning bg-warning-bg p-4 text-sm text-warning-fg">
              {unpaidTotals.unpaidCount} accepted {unpaidTotals.unpaidCount === 1 ? 'claim' : 'claims'} for {monthLabel(month)} ({formatMoney(unpaidTotals.unpaidPaise)}) {unpaidTotals.unpaidCount === 1 ? 'is' : 'are'} still unpaid, so{' '}
              {unpaidTotals.unpaidCount === 1 ? 'it is' : 'they are'} not in this sheet. Once paid, {unpaidTotals.unpaidCount === 1 ? 'it counts' : 'they count'} in the month you pay.{' '}
              <Link href={`/expenses?from=${bounds.from}&to=${bounds.to}`} className="font-medium underline">
                Review them
              </Link>
              .
            </p>
          ) : null}

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Employees" value={totals.employees} note={totals.joinedInMonth > 0 ? `${totals.joinedInMonth} joined this month, paid in full` : undefined} />
            <StatTile label="Net payable" value={formatMoney(totals.netPaise)} />
            <StatTile label="Paid in the month" value={formatMoney(totals.taDaPaise + totals.reimbursementPaise)} note="TA, DA and reimbursements" />
            <StatTile label="Leave deductions" value={formatMoney(totals.deductionPaise)} />
          </div>

          <Card>
            <TopProgressBar active={sheet.isFetching && !sheet.isLoading} />
            <DataState
              isLoading={sheet.isLoading}
              error={sheet.error ? toErrorState(sheet.error, () => void sheet.refetch()) : null}
              isEmpty={runs.length === 0}
              empty={{ title: `Nothing generated for ${monthLabel(month)}`, description: 'Generate the sheet to calculate every active field employee from what was paid in the month.' }}
            >
              <DataTable columns={columns} rows={runs} rowKey={(r) => r.id} />
            </DataState>
          </Card>
        </>
      )}

      {generating ? (
        <GenerateDialog
          month={month}
          employee={generating.employee ? { name: generating.employee.userName } : undefined}
          pending={generate.isPending}
          onClose={() => setGenerating(null)}
          onConfirm={() => generate.mutate({ month, ...(generating.employee && { userIds: [generating.employee.userId] }) })}
        />
      ) : null}
      {outcomes ? <GenerateResultDialog outcomes={outcomes} onClose={() => setOutcomes(null)} /> : null}
    </>
  );
}
