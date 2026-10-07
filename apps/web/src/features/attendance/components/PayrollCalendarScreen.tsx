'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { cn } from '@/components/ui/cn';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { usePayrollCalendar } from '../hooks/useAttendance';
import { CELL_CLASS, STATUS_CODE, STATUS_LABEL, monthsInYear, zipDays } from '../lib/attendance';
import { StatusLegend } from './StatusLegend';

/**
 * Every active field employee's month in one line, so HR and the Accountant can see who was absent before payroll is generated. A day
 * shown absent can still be turned into leave; once the month's salary is finalized it cannot.
 */
export function PayrollCalendarScreen() {
  const { values, update } = useFilterParams(['month']);
  const { year } = useFinancialYear();
  const today = istDate();
  const months = monthsInYear(year ?? financialYearOf(today), today);
  const month = months.includes(values.month) ? values.month : (months[0] ?? '');
  const query = usePayrollCalendar(month);
  const data = query.data;

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Each employee's days for the month. Working days with no report, leave or strike count as absent and are deducted from salary like unpaid leave."
      />
      {months.length === 0 ? (
        <Card>
          <p className="p-6 text-sm text-text-muted">No month of this financial year has started yet.</p>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <div className="w-56">
              <Select aria-label="Month" value={month} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} onValueChange={(v) => update({ month: v })} />
            </div>
            <StatusLegend />
          </div>
          <Card>
            <DataState
              isLoading={query.isLoading}
              error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
              isEmpty={!data || data.rows.length === 0}
              empty={{ title: 'No active field employees', description: 'Employees appear here once they are active.' }}
            >
              {data ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max text-sm">
                    <caption className="sr-only">Attendance for {monthLabel(month)}</caption>
                    <thead className="bg-surface-subtle text-xs text-text-subtle">
                      <tr>
                        <th scope="col" className="sticky left-0 bg-surface-subtle px-3 py-2 text-left font-medium">Employee</th>
                        {data.dates.map((d) => (
                          <th key={d} scope="col" className="px-0.5 py-2 text-center font-medium tabular-nums">
                            {Number(d.slice(8, 10))}
                          </th>
                        ))}
                        <th scope="col" className="px-3 py-2 text-right font-medium">Absent</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Deducted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r) => (
                        <tr key={r.user.id} className="border-t border-border">
                          <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal">
                            <Link href={`/employees/${r.user.id}`} className="font-medium text-text hover:text-accent hover:underline">
                              {r.user.name}
                            </Link>
                            <span className="ml-2 text-xs text-text-subtle">{r.user.employeeCode}</span>
                          </th>
                          {zipDays(data.dates, r.days).map((d) => (
                            <td key={d.date} className="px-0.5 py-1 text-center" title={`${d.date} · ${STATUS_LABEL[d.status]}`}>
                              <span aria-label={STATUS_LABEL[d.status]} className={cn('inline-flex size-6 items-center justify-center rounded text-[11px] font-semibold', CELL_CLASS[d.status])}>
                                {STATUS_CODE[d.status]}
                              </span>
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right tabular-nums">{r.absentDays}</td>
                          <td className={cn('px-3 py-2 text-right font-medium tabular-nums', r.deductibleDays > 0 ? 'text-danger-fg' : 'text-text-muted')}>{r.deductibleDays}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </DataState>
          </Card>
          {data ? (
            <p className="mt-3 text-[13px] text-text-subtle">
              {data.absentDeducts
                ? `“Deducted” is what payroll would take for the month: absent days${data.strikeDeducts ? ' and strike days' : ''}.`
                : 'Absent days are switched off in the settings; nothing is deducted.'}
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
