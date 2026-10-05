'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Field, FieldList } from '@/components/ui/FieldList';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDateTime, formatMoney } from '@/lib/format';
import { usePayrollRun } from '../hooks/usePayroll';
import { deductionExplanation, monthLabel, netAddsUp } from '../lib/payroll';

function Line({ label, note, amount, strong = false }: { label: string; note?: string | undefined; amount: string; strong?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-4 px-5 py-3 ${strong ? 'bg-surface-subtle' : ''}`}>
      <div>
        <p className={`text-sm ${strong ? 'font-semibold text-text' : 'text-text'}`}>{label}</p>
        {note ? <p className="mt-0.5 text-[13px] text-text-subtle">{note}</p> : null}
      </div>
      <p className={`text-sm tabular-nums ${strong ? 'font-semibold text-text' : 'text-text'}`}>{amount}</p>
    </div>
  );
}

/** One run broken down: base, what was paid in the month, the leave deduction explained, and the net. */
export function PayrollRunScreen({ id }: { id: string }) {
  const query = usePayrollRun(id);
  const run = query.data;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={run ? `/payroll?month=${run.month}` : '/payroll'} className="text-text-muted hover:text-accent hover:underline">
          ← Payroll
        </Link>
      </p>
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!run}
        empty={{ title: 'Payroll run not found' }}
        skeleton={
          <div role="status" aria-label="Loading" className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        {run ? (
          <>
            <PageHeader
              title={run.userName || 'Payroll run'}
              description={`${run.employeeCode} · ${monthLabel(run.month)}`}
              actions={<Badge tone={run.status === 'FINALIZED' ? 'success' : 'warning'}>{run.status === 'FINALIZED' ? 'Finalized' : 'Draft'}</Badge>}
            />
            {!netAddsUp(run) ? (
              <p role="alert" className="mb-6 rounded-lg border border-danger bg-danger-bg p-4 text-sm text-danger-fg">
                The net payable does not equal base plus TA/DA plus reimbursements minus the deduction. Do not finalize this run: regenerate it, and report it if it
                happens again.
              </p>
            ) : null}
            {run.joinedInMonth ? (
              <p className="mb-6 rounded-lg border border-border bg-surface-subtle p-4 text-sm text-text-muted">
                This employee joined in {monthLabel(run.month)}. The full base salary is paid; there is no proration.
              </p>
            ) : null}
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
              <Card title="How the net is worked out">
                <div className="divide-y divide-border">
                  <Line label="Base salary" note="Monthly gross from the CTC in force when this was generated (the CTC less the employer's EPF and ESI, ÷ 12); a later change does not alter it." amount={formatMoney(run.baseSalaryPaise)} />
                  <Line label="TA and DA paid" note={`Marked paid during ${monthLabel(run.month)}.`} amount={`+ ${formatMoney(run.totalTaDaPaise)}`} />
                  <Line label="Reimbursements paid" note="Travel, meals and other claims marked paid in the month." amount={`+ ${formatMoney(run.reimbursementPaise)}`} />
                  <Line label="Leave deduction" note={deductionExplanation(run)} amount={`− ${formatMoney(run.leaveDeductionPaise)}`} />
                  <Line strong label="Net payable" amount={formatMoney(run.netPayablePaise)} />
                </div>
              </Card>
              <Card title="Record">
                <div className="p-5">
                  <FieldList>
                    <Field label="Generated">{formatDateTime(run.generatedAt)}</Field>
                    <Field label="Finalized">{run.finalizedAt ? formatDateTime(run.finalizedAt) : null}</Field>
                    <Field label="Employee">
                      <Link href={`/employees/${run.userId}`} className="text-accent hover:underline">
                        {run.userName || 'Open the employee'}
                      </Link>
                    </Field>
                  </FieldList>
                </div>
              </Card>
            </div>
          </>
        ) : null}
      </DataState>
    </>
  );
}
