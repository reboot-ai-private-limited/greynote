'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatMoney } from '@/lib/format';
import { usePayrollRun } from '../hooks/usePayroll';
import { monthLabel } from '../lib/payroll';
import { payslipOf, type SlipLine } from '../lib/payslip';

function Rows({ lines }: { lines: readonly SlipLine[] }) {
  return (
    <>
      {lines.map((l) => (
        <tr key={l.label} className="border-b border-border">
          <td className="py-2 pr-4">{l.label}</td>
          <td className="py-2 text-right tabular-nums">{formatMoney(l.amountPaise)}</td>
        </tr>
      ))}
    </>
  );
}

/** A salary slip for one run: print it, or save it as a PDF from the print dialog. A draft says it is not final. */
export function PayslipScreen({ id }: { id: string }) {
  const query = usePayrollRun(id);
  const run = query.data;
  const slip = run ? payslipOf(run) : null;

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
        skeleton={<Skeleton className="h-96 w-full max-w-3xl" />}
      >
        {run && slip ? (
          <article className="mx-auto max-w-3xl rounded-lg border border-border bg-surface p-8 text-sm text-text print:border-0 print:p-0">
            <header className="mb-6 flex items-start justify-between gap-4 border-b border-border pb-4">
              <div>
                <h1 className="text-xl font-semibold">Salary slip</h1>
                <p className="text-text-muted">{monthLabel(run.month)}</p>
              </div>
              {run.status === 'DRAFT' ? <p className="rounded border border-warning px-2 py-1 text-xs font-medium text-warning-fg">DRAFT — not final</p> : null}
            </header>

            <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <dt className="text-text-subtle">Employee</dt>
                <dd className="font-medium">{run.userName}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Employee code</dt>
                <dd className="font-medium">{run.employeeCode}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">ESI number</dt>
                <dd className="font-medium">{run.esiNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Unpaid leave days</dt>
                <dd className="font-medium">{run.unpaidLeaveDays}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Absent days</dt>
                <dd className="font-medium">{run.absentDays}</dd>
              </div>
            </dl>

            <table className="mb-6 w-full">
              <thead>
                <tr className="border-b border-border-strong text-left text-text-subtle">
                  <th className="py-2 font-medium">Earnings</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                <Rows lines={slip.earnings} />
                <tr className="font-semibold">
                  <td className="py-2">Gross</td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(slip.grossPaise)}</td>
                </tr>
              </tbody>
            </table>

            <table className="mb-6 w-full">
              <thead>
                <tr className="border-b border-border-strong text-left text-text-subtle">
                  <th className="py-2 font-medium">Deductions</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {slip.deductions.length === 0 ? (
                  <tr>
                    <td className="py-2 text-text-muted">None</td>
                    <td className="py-2 text-right tabular-nums">{formatMoney(0)}</td>
                  </tr>
                ) : (
                  <Rows lines={slip.deductions} />
                )}
              </tbody>
            </table>

            <div className="flex items-center justify-between border-t-2 border-border-strong pt-3 text-base font-semibold">
              <span>Net pay</span>
              <span className="tabular-nums">{formatMoney(slip.netPaise)}</span>
            </div>
            <p className="mt-6 text-xs text-text-subtle">
              TA, DA and reimbursements are paid separately and are not part of this slip. This is a computer-generated slip.
            </p>
          </article>
        ) : null}
      </DataState>
    </>
  );
}
