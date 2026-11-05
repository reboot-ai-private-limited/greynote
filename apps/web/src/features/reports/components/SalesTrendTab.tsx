'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column, type SortState } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/ListToolbar';
import { StatTile } from '@/components/ui/StatTile';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { toErrorState } from '@/lib/api/toErrorState';
import type { SalesWindowQuery } from '@/lib/api/endpoints/reports';
import { downloadCsv, rupeesForCsv, toCsv } from '@/lib/csv';
import { financialYearLabel } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { downloadXlsx, rupees } from '@/lib/xlsx';
import { useEmployeeTrend, useProductTrend } from '../hooks/useSalesReport';
import { matchesSearch } from '../lib/salesBreakdown';
import { employeeTrend, orgSummary, productTrend, sortTrend, trendColumns, type TrendCell, type TrendGrain, type TrendKind, type TrendRow } from '../lib/salesTrend';

const tone = (p: number | null) => (p === null ? 'neutral' : p >= 100 ? 'success' : p >= 70 ? 'warning' : 'danger');
const compact = (paise: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1, style: 'currency', currency: 'INR' }).format(paise / 100);

function Figure({ c }: { c: TrendCell }) {
  if (c.valuePaise === 0 && c.targetPaise === 0) return <span className="text-text-subtle">—</span>;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span title={formatMoney(c.valuePaise)}>{compact(c.valuePaise)}</span>
      {c.percent !== null ? <span className={c.percent >= 100 ? 'text-[11px] text-success-fg' : 'text-[11px] text-text-subtle'}>{c.percent}%</span> : null}
    </span>
  );
}

/**
 * The owner's view (decision-log 2026-11-05): how the organisation is doing against target, then every product or employee month by month
 * (or quarter by quarter) with a year total, sortable, and downloadable as Excel or CSV. Each column is an ordinary by-product / by-employee
 * request, so the numbers are the same as on those tabs.
 */
export function SalesTrendTab({ fy }: { fy: number }) {
  const [kind, setKind] = useState<TrendKind>('employee');
  const [grain, setGrain] = useState<TrendGrain>('month');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'total', order: 'desc' });

  const columns = useMemo(() => trendColumns(fy, grain, monthLabel), [fy, grain]);
  const yearWindow: SalesWindowQuery = { year: fy, period: 'year' };
  const windows = useMemo(() => [...columns.map((c) => c.window), yearWindow], [columns, fy]); // eslint-disable-line react-hooks/exhaustive-deps
  const emp = useEmployeeTrend(windows, true);
  const prod = useProductTrend(windows, true);
  const active = kind === 'employee' ? emp : prod;
  const yearIdx = windows.length - 1;

  const rows: TrendRow[] = useMemo(() => {
    const byColumn = (list: typeof emp | typeof prod) => list.slice(0, yearIdx).map((q) => q.data);
    const built = kind === 'employee' ? employeeTrend(byColumn(emp) as never, emp[yearIdx]?.data) : productTrend(byColumn(prod) as never, prod[yearIdx]?.data);
    return sortTrend(built, sort).filter((r) => matchesSearch(search, r.label, r.sub));
  }, [kind, emp, prod, yearIdx, sort, search]);

  const summary = orgSummary(emp[yearIdx]?.data, prod[yearIdx]?.data);
  const loadingFirst = active.some((q) => q.isLoading);
  const failed = active.find((q) => q.error);
  const label = `${kind === 'employee' ? 'employee' : 'product'}-${grain}ly-${financialYearLabel(fy)}`.replace(/[^A-Za-z0-9-]+/g, '-');

  const tableColumns: Column<TrendRow>[] = [
    {
      key: 'label',
      header: kind === 'employee' ? 'Employee' : 'Product',
      sortable: true,
      render: (r) => (
        <span>
          {kind === 'employee' ? <Link href={`/reports/sales-dashboard/${r.id}`} className="font-medium text-accent hover:underline">{r.label}</Link> : <span className="font-medium">{r.label}</span>}{' '}
          <span className="text-text-subtle">{r.sub}</span>
        </span>
      ),
    },
    ...columns.map((c, i) => ({ key: String(i), header: c.label, numeric: true, sortable: true, render: (r: TrendRow) => <Figure c={r.cells[i]!} /> })),
    { key: 'total', header: 'Year', numeric: true, sortable: true, render: (r) => <span className="inline-flex items-center gap-2 font-semibold"><Figure c={r.total} />{r.total.percent !== null ? <Badge tone={tone(r.total.percent)}>{r.total.percent}%</Badge> : null}</span> },
  ];

  const header = [kind === 'employee' ? 'Employee' : 'Product', kind === 'employee' ? 'Code' : 'SKU', ...columns.map((c) => `${c.label} (₹)`), 'Year (₹)', 'Year target (₹)', 'Year achievement %'];
  const sheet = (money: (p: number) => string | number) => rows.map((r) => [r.label, r.sub, ...r.cells.map((c) => money(c.valuePaise)), money(r.total.valuePaise), money(r.total.targetPaise), r.total.percent]);

  const behindNote = (behind: number, of: number, noun: string) => (of === 0 ? `no ${noun} targets set` : `${behind} of ${of} ${noun}s behind target`);

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h2 className="mb-3 text-[15px] font-semibold text-text">Organisation, {financialYearLabel(fy)}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Achieved" value={formatMoney(summary.achievedPaise)} note={summary.percent === null ? 'no target set' : `${summary.percent}% of ${formatMoney(summary.targetPaise)}`} {...(summary.percent !== null ? { tone: tone(summary.percent) } : {})} />
          <StatTile label="Top employee" value={summary.bestEmployee?.label ?? '—'} note={summary.bestEmployee ? formatMoney(summary.bestEmployee.valuePaise) : 'no sales yet'} />
          <StatTile label="Top product" value={summary.bestProduct?.label ?? '—'} note={summary.bestProduct ? formatMoney(summary.bestProduct.valuePaise) : 'no sales yet'} />
          <StatTile label="Behind target" value={`${summary.employeesBehind}`} note={behindNote(summary.employeesBehind, summary.employeesWithTarget, 'employee')} {...(summary.employeesBehind > 0 ? { tone: 'warning' as const } : {})} />
        </div>
        <p className="mt-2 text-[13px] text-text-subtle">{behindNote(summary.productsBehind, summary.productsWithTarget, 'product')}.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="group" aria-label="Rows">
          {(['employee', 'product'] as const).map((k) => (
            <Button key={k} variant={kind === k ? 'primary' : 'secondary'} aria-pressed={kind === k} onClick={() => { setKind(k); setSearch(''); setSort({ key: 'total', order: 'desc' }); }}>{k === 'employee' ? 'By employee' : 'By product'}</Button>
          ))}
        </div>
        <div className="flex gap-1" role="group" aria-label="Columns">
          {(['month', 'quarter'] as const).map((g) => (
            <Button key={g} variant={grain === g ? 'primary' : 'secondary'} aria-pressed={grain === g} onClick={() => setGrain(g)}>{g === 'month' ? 'Monthly' : 'Quarterly'}</Button>
          ))}
        </div>
        <SearchInput label={kind === 'employee' ? 'Search employees' : 'Search products'} placeholder={kind === 'employee' ? 'Search name or code' : 'Search product or SKU'} value={search} onChange={setSearch} />
      </div>

      <Card
        title={`${kind === 'employee' ? 'Employees' : 'Products'}, ${grain === 'month' ? 'month by month' : 'quarter by quarter'}`}
        description={kind === 'employee' ? 'Achieved sales; small figure is % of that period\'s target. Click a name for their daily detail. A manager is the sum of their MRs; the total counts each MR once.' : 'Secondary sales valued at PTS; small figure is % of that period\'s target.'}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={loadingFirst || rows.length === 0} onClick={() => void downloadXlsx(label, 'Sales', header, sheet(rupees))}>Download Excel</Button>
            <Button variant="secondary" size="sm" disabled={loadingFirst || rows.length === 0} onClick={() => downloadCsv(`${label}.csv`, toCsv(header, sheet(rupeesForCsv)))}>Download CSV</Button>
          </div>
        }
      >
        <DataState isLoading={loadingFirst} isFetching={!loadingFirst && active.some((q) => q.isFetching)} error={failed?.error ? toErrorState(failed.error, () => active.forEach((q) => void q.refetch())) : null} isEmpty={rows.length === 0} empty={{ title: search ? 'Nothing matches your search' : 'No sales in this year' }}>
          <DataTable columns={tableColumns} rows={rows} rowKey={(r) => r.id} sort={sort} onSortChange={setSort} bleed={false} />
        </DataState>
      </Card>
    </div>
  );
}
