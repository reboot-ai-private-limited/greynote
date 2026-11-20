'use client';

import type { EmployeeDistributorFigureDto } from '@greynote/contracts';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate } from '@/lib/dates';
import { financialYearLabel, financialYearOf } from '@/lib/financial-year';
import { withAuth } from '@/lib/auth/session';
import { reportsApi } from '@/lib/api/endpoints/reports';
import { downloadBlob } from '@/lib/download';
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useEmployeeSalesReport } from '../hooks/useEmployeeSales';
import { PERIOD_OPTIONS, parsePeriod, periodMonths, rangeLabel } from '../lib/employeeSales';
import { financialYearMonths } from '../lib/salesDashboard';
import { EmployeeTargetsPanel } from './EmployeeTargetsPanel';

const money = (paise: number): string => formatMoney(paise);
const percent = (p: number | null): string => (p === null ? '—' : `${p}%`);

/**
 * One employee over a run of months: their targets (product by product, over any months of the year), what their Done orders came to (primary)
 * and what they sold (secondary, which is their achievement). Admin sees anyone, a manager their team.
 */
export function EmployeeSalesScreen({ userId }: { userId: string }) {
  const { values, update } = useFilterParams(['period', 'from', 'to']);
  const { year } = useFinancialYear();
  const today = istDate();
  const thisMonth = today.slice(0, 7);
  const fyMonths = useMemo(() => financialYearMonths(year ?? financialYearOf(today)), [year, today]);
  const period = parsePeriod(values.period);
  const range =
    period === 'custom'
      ? {
          from: fyMonths.includes(values.from) ? values.from : (fyMonths[0] ?? thisMonth),
          to: fyMonths.includes(values.to) ? values.to : (fyMonths[fyMonths.length - 1] ?? thisMonth),
        }
      : periodMonths(period, thisMonth, fyMonths);
  const bad = range.to < range.from ? 'The last month cannot be before the first.' : undefined;
  const query = useEmployeeSalesReport({ userId, ...range }, !bad);
  const data = query.data;
  const sheetYear = year ?? financialYearOf(today);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  // The Excel of this employee for the financial year selected at the top of the page (not a fixed year): the company's performance sheet.
  const downloadSheet = async () => {
    setSheetBusy(true);
    setSheetError(null);
    try {
      const file = await withAuth((token) => reportsApi.secondarySheet(token, { userId, year: sheetYear }));
      downloadBlob(`GREYNOTE SECONDARY SALES ${financialYearLabel(sheetYear).replace('–', '-')} ${data?.employee.name ?? ''}.xlsx`.replace(/\s+\.xlsx$/, '.xlsx'), file);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Could not make the file. Try again.');
    } finally {
      setSheetBusy(false);
    }
  };
  // The Monthly Work report (Excel) of this employee, for a month of the selected financial year.
  const reportMonths = fyMonths.filter((m) => m <= thisMonth);
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const workMonth = pickedMonth && reportMonths.includes(pickedMonth) ? pickedMonth : (reportMonths[reportMonths.length - 1] ?? thisMonth);
  const [monthBusy, setMonthBusy] = useState(false);
  const downloadMonth = async () => {
    setMonthBusy(true);
    setSheetError(null);
    try {
      const file = await withAuth((token) => reportsApi.employeeMonthlyWork(token, { userId, month: workMonth }));
      downloadBlob(`GREYNOTE MONTHLY WORK ${workMonth} ${data?.employee.name ?? ''}.xlsx`.replace(/\s+\.xlsx$/, '.xlsx'), file);
    } catch (err) {
      setSheetError(err instanceof Error ? err.message : 'Could not make the file. Try again.');
    } finally {
      setMonthBusy(false);
    }
  };
  const name = data?.employee.name ?? 'Employee';

  const monthOptions = fyMonths.map((m) => ({ value: m, label: monthLabel(m) }));
  const distributorColumns: readonly Column<EmployeeDistributorFigureDto>[] = [
    { key: 'distributor', header: 'Distributor', render: (d) => <span className="font-medium">{d.distributor.name}</span> },
    { key: 'qty', header: 'Units delivered', numeric: true, render: (d) => d.orderQty.toLocaleString('en-IN') },
    { key: 'paise', header: 'Primary (₹)', numeric: true, render: (d) => money(d.orderPaise) },
  ];
  return (
    <>
      <Link
        href="/reports/sales-dashboard"
        className="mb-3 inline-flex items-center gap-1 text-[13px] text-text-muted hover:text-text"
      >
        <ArrowLeft aria-hidden className="size-3.5" /> Sales dashboard
      </Link>
      <PageHeader
        title={name}
        description={
          data
            ? `${data.employee.employeeCode} · ${data.team ? `The total of the ${data.team.mrCount} MRs in their team. ` : ''}Targets, primary (received) and secondary (issued, their achievement), as the approved figures their MRs entered for ${rangeLabel(data.fromMonth, data.toMonth)}.`
            : 'Targets, primary and secondary.'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="w-40">
              <Select aria-label="Month for the monthly work report" value={workMonth} options={reportMonths.map((m) => ({ value: m, label: monthLabel(m) }))} onValueChange={(v) => setPickedMonth(v)} />
            </div>
            <Button variant="secondary" disabled={monthBusy} onClick={() => void downloadMonth()}>
              {monthBusy ? 'Preparing…' : 'Monthly work (Excel)'}
            </Button>
            <Button variant="secondary" disabled={sheetBusy} onClick={() => void downloadSheet()}>
              {sheetBusy ? 'Preparing…' : `Download Excel · ${financialYearLabel(sheetYear)}`}
            </Button>
          </div>
        }
      />
      {sheetError ? <p role="alert" className="mb-3 text-[13px] text-danger">{sheetError}</p> : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Select
            aria-label="Period"
            value={period}
            options={[...PERIOD_OPTIONS]}
            onValueChange={(v) => update({ period: v === 'month' ? undefined : v })}
          />
        </div>
        {period === 'custom' ? (
          <>
            <div className="w-48">
              <Select aria-label="From month" value={range.from} options={monthOptions} onValueChange={(v) => update({ from: v })} />
            </div>
            <div className="w-48">
              <Select aria-label="To month" value={range.to} options={monthOptions} onValueChange={(v) => update({ to: v })} />
            </div>
          </>
        ) : null}
        {bad ? <p role="alert" className="text-[13px] text-danger-fg">{bad}</p> : null}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Target" value={money(data?.totals.targetPaise ?? 0)} />
        <StatTile label="Primary" value={money(data?.totals.primaryPaise ?? 0)} />
        <StatTile label="Secondary" value={money(data?.totals.secondaryPaise ?? 0)} />
        <StatTile
          label="Achievement"
          value={percent(data?.totals.achievementPercent ?? null)}
          note="Secondary against target"
        />
      </div>

      <div className="mb-6">
        <EmployeeTargetsPanel userId={userId} name={name} />
      </div>

      <DataState
        isLoading={!bad && query.isLoading}
        isFetching={query.isFetching}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={false}
        empty={{ title: '', description: '' }}
      >
        <div className="space-y-6">
          <Card title="By distributor" description="Done orders to each distributor, for information (free units in the units, never in the rupees). The primary and secondary above are the MRs' approved figures.">
            {data && data.distributors.length > 0 ? (
              <>
                <DataTable columns={distributorColumns} rows={data.distributors} rowKey={(d) => d.distributor.id} bleed={false} />
                <p className="px-5 py-3 text-right text-[13px] font-medium tabular-nums">Total {money(data.distributors.reduce((n, d) => n + d.orderPaise, 0))}</p>
              </>
            ) : (
              <p className="px-5 py-6 text-[13px] text-text-muted">No order to a distributor was marked done in these months.</p>
            )}
          </Card>
        </div>
      </DataState>

    </>
  );
}
