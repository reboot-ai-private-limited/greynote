'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { PayrollDayDto } from '@greynote/contracts';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useSession } from '@/lib/auth/SessionProvider';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Field, FieldList } from '@/components/ui/FieldList';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { usePayrollRun } from '../hooks/usePayroll';
import { absentExplanation, CHARGEABLE_DAY_STATUSES, chargeLabel, deductionExplanation, describePayrollAdjustment, latestDayOverrides, monthLabel, netAddsUp, PAYROLL_DAY_LABEL, RUN_STAGE_LABEL, RUN_STAGE_TONE, runStage } from '../lib/payroll';
import { FinalizeDialog } from './FinalizeDialog';
import { PayRunDialog } from './PayRunDialog';
import { PayrollAmountDialog } from './PayrollAmountDialog';
import { PayrollDayDialog } from './PayrollDayDialog';

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

/** One run broken down: base, the leave deduction explained, and the net (older runs also show TA/DA paid in the month). */
export function PayrollRunScreen({ id }: { id: string }) {
  const query = usePayrollRun(id);
  const run = query.data;
  const { user } = useSession();
  const readOnly = useIsReadOnly();
  const canEdit = user?.role === 'HR' || user?.role === 'ADMIN';
  const canClose = user?.role === 'ACCOUNTANT' || user?.role === 'ADMIN';
  const [dayOpen, setDayOpen] = useState<PayrollDayDto | null>(null);
  const [amountOpen, setAmountOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [paying, setPaying] = useState(false);
  const stage = run ? runStage(run) : 'DRAFT';
  const editable = run?.status === 'DRAFT';
  const overrides = run ? latestDayOverrides(run) : new Map();

  const dayColumns: readonly Column<PayrollDayDto>[] = [
    { key: 'date', header: 'Date', render: (d) => <span className="whitespace-nowrap font-medium">{formatDate(d.date)}</span> },
    { key: 'status', header: 'Day', render: (d) => <Badge tone={d.status === 'ABSENT' ? 'danger' : d.status === 'LEAVE' ? 'warning' : 'neutral'}>{PAYROLL_DAY_LABEL[d.status] ?? d.status}{d.leaveType ? ` · ${d.leaveType}` : ''}</Badge> },
    { key: 'rules', header: 'Charged by the rules', numeric: true, render: (d) => chargeLabel(d.deductedDays) },
    {
      key: 'now',
      header: 'Charged now',
      numeric: true,
      render: (d) => {
        const o = overrides.get(d.date);
        return o ? <span className="font-semibold text-warning-fg" title={o.reason}>{chargeLabel(o.setDays)} · changed</span> : chargeLabel(d.deductedDays);
      },
    },
    {
      key: 'change',
      header: '',
      className: 'w-24 text-right',
      render: (d) =>
        canEdit && editable && CHARGEABLE_DAY_STATUSES.has(d.status) ? (
          <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => setDayOpen(d)}>
            Change
          </Button>
        ) : null,
    },
  ];

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
              actions={
                <div className="flex items-center gap-3">
                  <Link href={`/payroll/${run.id}/slip`} className="text-sm text-accent hover:underline">
                    Salary slip
                  </Link>
                  <Badge tone={RUN_STAGE_TONE[stage]}>{RUN_STAGE_LABEL[stage]}</Badge>
                  {canClose && stage === 'DRAFT' ? (
                    <Button disabled={readOnly} onClick={() => setFinalizing(true)}>
                      Finalize
                    </Button>
                  ) : null}
                  {canClose && stage === 'FINALIZED' ? (
                    <Button disabled={readOnly} onClick={() => setPaying(true)}>
                      Mark paid
                    </Button>
                  ) : null}
                </div>
              }
            />
            {!netAddsUp(run) ? (
              <p role="alert" className="mb-6 rounded-lg border border-danger bg-danger-bg p-4 text-sm text-danger-fg">
                The net payable does not equal the base salary minus the deductions (plus TA/DA and reimbursements on an older run). Do not finalize this run: regenerate it, and report it if it
                happens again.
              </p>
            ) : null}
            {run.joinedInMonth ? (
              <p className="mb-6 rounded-lg border border-border bg-surface-subtle p-4 text-sm text-text-muted">
                This employee joined in {monthLabel(run.month)}. The full base salary is paid; there is no proration.
              </p>
            ) : null}
            {run.leftInMonth ? (
              <p className="mb-6 rounded-lg border border-border bg-surface-subtle p-4 text-sm text-text-muted">
                This employee left in {monthLabel(run.month)}. The full base salary is paid; there is no proration, and the days after they left are not
                counted as absent. Adjust it here if their final settlement should differ.
              </p>
            ) : null}
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
              <Card title="How the net is worked out">
                <div className="divide-y divide-border">
                  <Line label="Base salary" note="Monthly gross from the CTC in force when this was generated (the total earnings, which are the CTC, ÷ 12); a later change does not alter it." amount={formatMoney(run.baseSalaryPaise)} />
                  {run.totalTaDaPaise !== 0 || run.reimbursementPaise !== 0 ? (
                    <>
                      <Line label="TA and DA paid" note={`Marked paid during ${monthLabel(run.month)} (a run from before TA/DA moved to its own payout).`} amount={`+ ${formatMoney(run.totalTaDaPaise)}`} />
                      <Line label="Reimbursements paid" note="Travel, meals and other claims marked paid in the month." amount={`+ ${formatMoney(run.reimbursementPaise)}`} />
                    </>
                  ) : null}
 {run.deductionLines.length > 0 ? (
                    <Line label="EPF, ESI and professional tax" note={`${run.deductionLines.map((d) => `${d.name} ${formatMoney(d.amountPaise)}`).join(' · ')}. Taken on the full salary, not reduced by leave days.`} amount={`− ${formatMoney(run.statutoryDeductionPaise)}`} />
                  ) : null}
                  <Line label="Leave deduction" note={deductionExplanation(run)} amount={`− ${formatMoney(run.leaveDeductionPaise)}`} />
                  <Line label="Absent deduction" note={absentExplanation(run)} amount={`− ${formatMoney(run.absentDeductionPaise)}`} />
                  {run.roundingPaise !== 0 ? <Line label="Rounding to the rupee" note="The net is brought to a whole rupee, half up." amount={`${run.roundingPaise > 0 ? '+' : '−'} ${formatMoney(Math.abs(run.roundingPaise))}`} /> : null}
                  {run.adjustments.length > 0 ? <Line label="Adjustments by HR" note={`The net the rules gave was ${formatMoney(run.originalNetPayablePaise)}. See the changes below.`} amount={`${run.adjustmentPaise >= 0 ? '+' : '−'} ${formatMoney(Math.abs(run.adjustmentPaise))}`} /> : null}
                  <Line strong label="Net payable" amount={formatMoney(run.netPayablePaise)} />
                </div>
              </Card>
              <Card title="Record">
                <div className="p-5">
                  <FieldList>
                    <Field label="Generated">{formatDateTime(run.generatedAt)}</Field>
                    <Field label="Finalized">{run.finalizedAt ? `${formatDateTime(run.finalizedAt)}${run.finalizedByName ? ` by ${run.finalizedByName}` : ''}` : null}</Field>
                    <Field label="Paid">{run.paidAt ? `${formatDateTime(run.paidAt)}${run.paidByName ? ` by ${run.paidByName}` : ''}${run.paymentReference ? ` · ${run.paymentReference}` : ''}` : null}</Field>
                    <Field label="ESI number">{run.esiNumber}</Field>
                    <Field label="EPF number">{run.epfNumber}</Field>
                    <Field label="Employee">
                      <Link href={`/employees/${run.userId}`} className="text-accent hover:underline">
                        {run.userName || 'Open the employee'}
                      </Link>
                    </Field>
                  </FieldList>
                </div>
              </Card>
            </div>
            {run.days.length > 0 ? (
              <Card title="The month day by day" className="mt-6">
                <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                  <p className="text-sm text-text-muted">What each day was, and how many days of pay the rules charge for it. HR can charge a day differently while the run is a draft.</p>
                  {canEdit && editable ? (
                    <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => setAmountOpen(true)}>
                      Add or take off an amount
                    </Button>
                  ) : null}
                </div>
                <DataTable columns={dayColumns} rows={run.days} rowKey={(d) => d.date} />
              </Card>
            ) : canEdit && editable ? (
              <p className="mt-6 text-sm text-text-muted">
                This run was generated before the day-by-day view existed. Regenerate it to charge days differently.{' '}
                <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => setAmountOpen(true)}>
                  Add or take off an amount
                </Button>
              </p>
            ) : null}
            {run.adjustments.length > 0 ? (
              <Card title="Changes made by HR or Admin" className="mt-6">
                <ul className="divide-y divide-border">
                  {run.adjustments.map((a) => (
                    <li key={a.id} className="px-5 py-3 text-sm">
                      <p className="font-medium text-text">
                        {a.date ? `${formatDate(a.date)} · ` : ''}
                        {describePayrollAdjustment(a)}
                      </p>
                      <p className="text-text-muted">{a.reason}</p>
                      <p className="text-xs text-text-subtle">
                        {a.by.name || 'Someone'} ({a.by.role}) · {formatDateTime(a.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {dayOpen ? <PayrollDayDialog runId={run.id} day={dayOpen} current={overrides.get(dayOpen.date)?.setDays ?? dayOpen.deductedDays} onClose={() => setDayOpen(null)} /> : null}
            {amountOpen ? <PayrollAmountDialog runId={run.id} onClose={() => setAmountOpen(false)} /> : null}
            {finalizing ? <FinalizeDialog runs={[run]} month={run.month} onClose={() => setFinalizing(false)} /> : null}
            {paying ? <PayRunDialog run={run} onClose={() => setPaying(false)} /> : null}
          </>
        ) : null}
      </DataState>
    </>
  );
}
