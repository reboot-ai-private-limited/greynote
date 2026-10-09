'use client';

import type { SalaryMonthDto } from '@greynote/contracts';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatTile } from '@/components/ui/StatTile';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv } from '@/lib/csv';
import { istDate } from '@/lib/dates';
import { financialYearLabel, financialYearOf } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useSalaryYear } from '../hooks/useSalaryReport';
import { SALARY_STATE_LABEL, SALARY_STATE_TONE, salaryEmployeesCsv, salaryEmployeesFilename, salaryMatrix, salaryMonthsCsv, salaryMonthsFilename, startedMonths, wholeRupees } from '../lib/salary';
import { monthTick } from '../lib/salesChart';
import type { StackView } from '../lib/stackChart';
import { SalaryStackChart } from './SalaryStackChart';

const money = (paise: number): string => formatMoney(paise);

/**
 * What salary was paid, for the financial year in view (sign-off K27, K30): a stacked bar per month of net pay with the TA, DA and reimbursements on top
 * (or the deductions), the month's totals with the employer's contributions and the cost to the company, and each employee's net pay month by month.
 * Finalized runs are the figures; a month of drafts is hatched and left out of the totals. Reads only: runs are generated and finalized on Payroll.
 */
export function SalaryReportScreen() {
  const { values, update } = useFilterParams(['view', 'month']);
  const { year } = useFinancialYear();
  const fy = year ?? financialYearOf(istDate());
  const query = useSalaryYear(fy);
  const report = query.data;
  const view: StackView = values.view === 'deductions' ? 'DEDUCTIONS' : 'COST';
  const months = report?.months ?? [];
  const started = startedMonths(months);
  const selected = started.find((m) => m.month === values.month)?.month ?? '';
  const matrix = report ? salaryMatrix(report) : [];
  const shown = selected ? started.filter((m) => m.month === selected) : started;
  const draftMonths = started.filter((m) => m.state === 'DRAFT' || m.state === 'PARTIAL').length;

  const monthColumns: readonly Column<SalaryMonthDto>[] = [
    { key: 'month', header: 'Month', render: (m) => <button type="button" className={m.month === selected ? 'font-semibold text-accent' : 'font-medium text-text hover:text-accent hover:underline'} onClick={() => update({ month: m.month === selected ? '' : m.month })}>{monthTick(m.month)}</button> },
    { key: 'state', header: 'Status', render: (m) => <Badge tone={SALARY_STATE_TONE[m.state]}>{SALARY_STATE_LABEL[m.state]}</Badge> },
    { key: 'employees', header: 'Employees', numeric: true, render: (m) => (m.draftEmployees > 0 ? `${m.finalEmployees} + ${m.draftEmployees} draft` : m.finalEmployees) },
    { key: 'base', header: 'Base', numeric: true, render: (m) => money(m.basePaise) },
    { key: 'deductions', header: 'Deductions', numeric: true, render: (m) => money(m.leaveDeductionPaise + m.absentDeductionPaise) },
    { key: 'net', header: 'Net pay', numeric: true, render: (m) => <span className="font-medium">{money(m.netPaise)}</span> },
    { key: 'employer', header: 'Employer EPF/ESI', numeric: true, render: (m) => money(m.employerPaise) },
    { key: 'cost', header: 'Cost to company', numeric: true, render: (m) => <span className="font-medium">{money(m.costToCompanyPaise)}</span> },
    { key: 'draft', header: 'Draft net, not counted', numeric: true, render: (m) => (m.draftNetPaise > 0 ? <span className="text-text-subtle italic">{money(m.draftNetPaise)}</span> : '—') },
  ];

  const t = report?.totals;
  return (
    <>
      <PageHeader
        title="Salary"
        description={`Net pay by month and employee, ${financialYearLabel(fy)}. Finalized runs are the figures; draft runs are shown hatched and left out of the totals.`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/payroll" className="text-sm text-accent hover:underline">
              Generate or finalize on Payroll
            </Link>
            <Button variant="secondary" disabled={!report} onClick={() => report && downloadCsv(salaryMonthsFilename(fy), salaryMonthsCsv(report))}>
              Download CSV
            </Button>
          </div>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Net pay, year to date" value={money(t?.netPaise ?? 0)} note="finalized runs" />
        <StatTile label="Cost to company" value={money(t?.costToCompanyPaise ?? 0)} note={`net pay + ${money(t?.employerPaise ?? 0)} employer EPF/ESI`} />
        <StatTile label="Deducted" value={money((t?.leaveDeductionPaise ?? 0) + (t?.absentDeductionPaise ?? 0))} note={`${money(t?.leaveDeductionPaise ?? 0)} leave · ${money(t?.absentDeductionPaise ?? 0)} absent`} />
        <StatTile label="Months not yet final" value={`${draftMonths}`} note={draftMonths > 0 ? 'drafts are outside the totals' : 'every month with a run is finalized'} tone={draftMonths > 0 ? 'warning' : undefined} />
      </div>

      <Card
        title="By month"
        description="Click a month to look at it alone; click it again to see them all."
        actions={
          <div className="flex gap-1" role="group" aria-label="Show">
            <Button size="sm" variant={view === 'COST' ? 'primary' : 'secondary'} aria-pressed={view === 'COST'} onClick={() => update({ view: '' })}>
              What it cost
            </Button>
            <Button size="sm" variant={view === 'DEDUCTIONS' ? 'primary' : 'secondary'} aria-pressed={view === 'DEDUCTIONS'} onClick={() => update({ view: 'deductions' })}>
              Deductions
            </Button>
          </div>
        }
      >
        <div className="p-5">
          <DataState
            isLoading={query.isLoading}
            error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
            isEmpty={started.length === 0}
            empty={{ title: 'No month of this financial year has started yet' }}
          >
            <SalaryStackChart months={months} view={view} selected={selected} onSelect={(m) => update({ month: m === selected ? '' : m })} />
            <div className="mt-4 overflow-hidden rounded-md border border-border">
              <DataTable columns={monthColumns} rows={shown} rowKey={(m) => m.month} bleed={false} />
            </div>
          </DataState>
        </div>
      </Card>

      <Card
        title="Net pay by employee"
        description="Each cell is that month's net pay and opens the salary slip. Italic cells are drafts and are not in the total."
        actions={
          <Button variant="secondary" size="sm" disabled={!report || report.rows.length === 0} onClick={() => report && downloadCsv(salaryEmployeesFilename(fy), salaryEmployeesCsv(report))}>
            Download CSV
          </Button>
        }
        className="mt-6"
      >
        <DataState isLoading={query.isLoading} error={null} isEmpty={matrix.length === 0} empty={{ title: 'No salary runs yet', description: 'Generate the first sheet on Payroll once a month has ended.' }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <caption className="sr-only">Net pay by employee and month</caption>
              <thead className="bg-surface-subtle text-xs text-text-subtle">
                <tr>
                  <th scope="col" className="sticky left-0 bg-surface-subtle px-3 py-2 text-left font-medium">Employee</th>
                  {started.map((m) => (
                    <th key={m.month} scope="col" className="px-3 py-2 text-right font-medium">
                      {monthTick(m.month)}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right font-medium">Year (finalized)</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((r) => (
                  <tr key={r.user.id} className="border-t border-border">
                    <th scope="row" className="sticky left-0 bg-surface px-3 py-2 text-left font-normal">
                      <Link href={`/employees/${r.user.id}`} className="font-medium text-text hover:text-accent hover:underline">
                        {r.user.name}
                      </Link>
                      <span className="ml-2 text-xs text-text-subtle">{r.user.employeeCode}</span>
                    </th>
                    {started.map((m) => {
                      const run = r.byMonth.get(m.month);
                      return (
                        <td key={m.month} className="px-3 py-2 text-right tabular-nums">
                          {run ? (
                            <Link href={`/payroll/${run.runId}/slip`} className={run.status === 'DRAFT' ? 'italic text-text-subtle hover:underline' : 'text-text hover:text-accent hover:underline'} title={run.status === 'DRAFT' ? 'Draft: not in the total' : 'Open the salary slip'}>
                              {wholeRupees(run.netPaise)}
                            </Link>
                          ) : (
                            <span className="text-text-subtle">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{wholeRupees(r.netFinalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </Card>
    </>
  );
}
