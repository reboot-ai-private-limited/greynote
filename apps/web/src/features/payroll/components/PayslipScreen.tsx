'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatMoney } from '@/lib/format';
import { usePayrollRun } from '../hooks/usePayroll';
import { monthLabel } from '../lib/payroll';
import { payslipOf, type SlipLine } from '../lib/payslip';

/** A month is paid as 30 days whatever its length (HLD 7), so the slip counts 30 working days. */
const PAID_DAYS = 30;

function Details({ title, rows }: { title: string; rows: ReadonlyArray<[string, ReactNode]> }) {
  return (
    <table className="w-full border border-border text-sm">
      <thead>
        <tr className="bg-surface-hover">
          <th scope="col" colSpan={2} className="border-b border-border px-3 py-2 text-left font-semibold">{title}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-border last:border-b-0">
            <th scope="row" className="w-1/2 px-3 py-2 text-left font-normal text-text-muted">{label}</th>
            <td className="px-3 py-2 font-medium">{value ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Amounts({ title, lines, totalLabel, total, emptyText }: { title: string; lines: readonly SlipLine[]; totalLabel: string; total: number; emptyText?: string }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <table className="w-full border border-border text-sm">
        <thead>
          <tr className="bg-surface-hover">
            <th scope="col" className="border-b border-border px-3 py-2 text-left font-semibold">Particulars</th>
            <th scope="col" className="border-b border-border px-3 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr className="border-b border-border">
              <td className="px-3 py-2 text-text-muted">{emptyText ?? 'None'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(0)}</td>
            </tr>
          ) : (
            lines.map((l) => (
              <tr key={l.label} className="border-b border-border">
                <td className="px-3 py-2">{l.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatMoney(l.amountPaise)}</td>
              </tr>
            ))
          )}
          <tr className="font-semibold">
            <td className="px-3 py-2">{totalLabel}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatMoney(total)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

/** A salary slip for one run, laid out like the company's own: print it, or save it as a PDF from the print dialog. A draft says it is not final. */
export function PayslipScreen({ id }: { id: string }) {
  const query = usePayrollRun(id);
  const run = query.data;
  const slip = run ? payslipOf(run) : null;
  const attended = run ? Math.max(0, PAID_DAYS - run.unpaidLeaveDays - run.absentDays) : 0;

  return (
    <>
      <div data-print-hide className="mb-4 flex items-center justify-between">
        <Link href={`/payroll/${id}`} className="text-sm text-text-muted hover:text-accent hover:underline">
          ← The run
        </Link>
        <Button onClick={() => window.print()} disabled={!run}>
          Print or save as PDF
        </Button>
      </div>
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!run}
        empty={{ title: 'Payroll run not found' }}
        skeleton={<Skeleton className="h-96 w-full max-w-4xl" />}
      >
        {run && slip ? (
          <article className="mx-auto max-w-4xl space-y-8 rounded-lg border border-border bg-surface p-6 text-sm text-text sm:p-8 print:border-0 print:p-0">
            <header className="grid items-center gap-4 rounded-xl bg-surface-hover px-6 py-5 sm:grid-cols-[1fr_auto_1fr]">
              <p aria-hidden className="text-2xl font-bold tracking-wide text-accent">GREYNOTE</p>
              <div className="text-center">
                <h1 className="text-2xl font-bold leading-tight">GreyNote Health Care Pvt. Ltd.</h1>
                <p className="mt-2 inline-block rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">ISO 9001:2015 Certified Company</p>
              </div>
              <div className="sm:text-right">
                <p className="text-2xl font-semibold">Salary Slip</p>
                <p className="text-text-muted">For the month of {monthLabel(run.month)}</p>
                {run.status === 'DRAFT' ? <p className="mt-2 inline-block rounded border border-warning px-2 py-0.5 text-xs font-medium text-warning-fg">DRAFT — not final</p> : null}
              </div>
            </header>

            <div className="grid gap-6 sm:grid-cols-2">
              <Details
                title="Employee Details"
                rows={[
                  ['Employee Name', run.userName],
                  ['Employee Code', run.employeeCode],
                  ['Designation', run.designationName],
                  ['UAN Code', run.epfNumber],
                  ['ESI Number', run.esiNumber],
                  ['Bank Account Number', run.bankAccountNumber],
                  ['Bank Name', run.bankName],
                ]}
              />
              <Details
                title="Employment Details"
                rows={[
                  ['Date of Joining', run.dateOfJoining],
                  ['Total Working Days', PAID_DAYS],
                  ['Days Attended', attended],
                  ['Unpaid Leave Days', run.unpaidLeaveDays],
                  ['Absent Days', run.absentDays],
                ]}
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <Amounts title="Earnings" lines={slip.earnings} totalLabel="Total Earnings" total={slip.grossPaise} />
              <Amounts title="Deductions" lines={slip.deductions} totalLabel="Total Deductions" total={slip.deductionPaise} />
            </div>

            <footer className="flex flex-wrap items-end justify-between gap-4">
              <p className="max-w-md text-xs text-text-subtle">
                This is a computer generated salary slip from GreyNote Health Care Pvt. Ltd. TA, DA and reimbursements are paid separately and are not part of this slip.
              </p>
              <div className="text-right">
                <p className="text-lg font-semibold">Net Salary</p>
                <p className="text-3xl font-bold tabular-nums">{formatMoney(slip.netPaise)}</p>
                {slip.roundingPaise !== 0 ? (
                  <p className="text-xs text-text-subtle">
                    Rounded off to the rupee ({slip.roundingPaise > 0 ? '+' : '−'}
                    {formatMoney(Math.abs(slip.roundingPaise))})
                  </p>
                ) : null}
              </div>
            </footer>
          </article>
        ) : null}
      </DataState>
    </>
  );
}
