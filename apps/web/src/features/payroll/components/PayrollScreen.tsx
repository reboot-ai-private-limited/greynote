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
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv } from '@/lib/csv';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { useGenerate, usePayrollMonth } from '../hooks/usePayroll';
import { draftRuns, endedMonthsInYear, monthLabel, monthState, payrollCsv, payrollFilename, runTotals } from '../lib/payroll';
import { FinalizeDialog } from './FinalizeDialog';
import { GenerateDialog } from './GenerateDialog';
import { GenerateResultDialog } from './GenerateResultDialog';

/** One month's salary sheet: generate it, review it, and finalize it to lock it. */
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
  const [finalizing, setFinalizing] = useState<PayrollRunDto[] | null>(null);

  const sheet = usePayrollMonth(month, month !== '');
  const runs = sheet.data ?? [];
  const totals = runTotals(runs);
  const state = monthState(runs);
  const drafts = draftRuns(runs);
  const generate = useGenerate((result) => {
    setGenerating(null);
    setOutcomes(result);
  });

  // Runs finalized before 2026-10-06 included TA/DA and reimbursements; those columns show only while such a run is in view.
  const hasExpenseLines = runs.some((r) => r.totalTaDaPaise !== 0 || r.reimbursementPaise !== 0);

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
    ...(hasExpenseLines
      ? ([
          { key: 'taDa', header: 'TA + DA paid', numeric: true, render: (r) => formatMoney(r.totalTaDaPaise) },
          { key: 'reimb', header: 'Reimbursed', numeric: true, render: (r) => formatMoney(r.reimbursementPaise) },
        ] satisfies Column<PayrollRunDto>[])
      : []),
    { key: 'leave', header: 'Unpaid leave', numeric: true, render: (r) => (r.unpaidLeaveDays === 0 ? '—' : `${r.unpaidLeaveDays} d · −${formatMoney(r.leaveDeductionPaise)}`) },
    { key: 'absent', header: 'Absent', numeric: true, render: (r) => (r.absentDays === 0 ? '—' : `${r.absentDays} d · −${formatMoney(r.absentDeductionPaise)}`) },
    { key: 'net', header: 'Net payable', numeric: true, render: (r) => <span className="font-semibold">{formatMoney(r.netPayablePaise)}</span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'FINALIZED' ? 'success' : 'warning'}>{r.status === 'FINALIZED' ? 'Finalized' : 'Draft'}</Badge> },
    {
      key: 'actions',
      header: '',
      className: 'w-64 text-right',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Link href={`/payroll/${r.id}`} className="text-sm text-accent hover:underline">
            Details
          </Link>
          {r.status === 'DRAFT' ? (
            <>
              <Button size="sm" variant="secondary" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setGenerating({ employee: r })}>
                Regenerate
              </Button>
              <Button size="sm" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setFinalizing([r])}>
                Finalize
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payroll"
        description="A sheet per month for every active field employee: base salary less unpaid leave. TA, DA and reimbursements are paid separately, on the 15th."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={runs.length === 0} onClick={() => downloadCsv(payrollFilename(month), payrollCsv(runs))}>
              Download CSV
            </Button>
            {drafts.length > 0 ? (
              <Button variant="secondary" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setFinalizing(drafts)}>
                Finalize {drafts.length === 1 ? 'the draft' : `all ${drafts.length} drafts`}
              </Button>
            ) : null}
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

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Employees" value={totals.employees} note={totals.joinedInMonth > 0 ? `${totals.joinedInMonth} joined this month, paid in full` : undefined} />
            <StatTile label="Net payable" value={formatMoney(totals.netPaise)} />
            {hasExpenseLines ? <StatTile label="Paid in the month" value={formatMoney(totals.taDaPaise + totals.reimbursementPaise)} note="TA, DA and reimbursements (older runs)" /> : <StatTile label="Base salary" value={formatMoney(totals.basePaise)} />}
            <StatTile label="Leave deductions" value={formatMoney(totals.deductionPaise)} />
          </div>

          <Card>
            <TopProgressBar active={sheet.isFetching && !sheet.isLoading} />
            <DataState
              isLoading={sheet.isLoading}
              error={sheet.error ? toErrorState(sheet.error, () => void sheet.refetch()) : null}
              isEmpty={runs.length === 0}
              empty={{ title: `Nothing generated for ${monthLabel(month)}`, description: 'Generate the sheet to work out the salary of every active field employee for the month.' }}
            >
              <DataTable columns={columns} rows={runs} rowKey={(r) => r.id} bleed={false} />
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
      {finalizing ? <FinalizeDialog runs={finalizing} month={month} onClose={() => setFinalizing(null)} /> : null}
      {outcomes ? <GenerateResultDialog outcomes={outcomes} onClose={() => setOutcomes(null)} /> : null}
    </>
  );
}
