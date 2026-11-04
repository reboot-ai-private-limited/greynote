'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column, type SortState } from '@/components/ui/DataTable';
import { SearchInput } from '@/components/ui/ListToolbar';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { StatTile } from '@/components/ui/StatTile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useDistributors } from '@/features/field-master-data/hooks/useDistributors';
import { useActiveProducts } from '@/features/field-master-data/hooks/useProducts';
import { toErrorState } from '@/lib/api/toErrorState';
import type { SalesWindowQuery } from '@/lib/api/endpoints/reports';
import { downloadCsv } from '@/lib/csv';
import { downloadXlsx } from '@/lib/xlsx';
import { useState } from 'react';
import { istDate } from '@/lib/dates';
import { financialYearLabel, financialYearOf } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useSalesByDistributor, useSalesByEmployee, useSalesByProduct } from '../hooks/useSalesReport';
import { SalesStatementScreen } from './SalesStatementScreen';
import { SalesTrendTab } from './SalesTrendTab';
import {
  QUARTER_OPTIONS,
  SALES_PERIOD_OPTIONS,
  defaultMonth,
  distributorCsv,
  employeeCsv,
  fyMonths,
  matchesSearch,
  parseSalesPeriod,
  productCsv,
  productSheet,
  employeeSheet,
  distributorSheet,
  quarterOf,
  salesBreakdownFilename,
  windowLabel,
} from '../lib/salesBreakdown';
import type { SalesByDistributorRowDto, SalesByEmployeeRowDto, SalesByProductRowDto } from '@greynote/contracts';

const ANY = 'all';
const qty = (n: number): string => n.toLocaleString('en-IN');
const percent = (n: number | null): string => (n === null ? '—' : `${n}%`);
const achievementTone = (n: number | null) => (n === null ? 'neutral' : n >= 100 ? 'success' : n >= 70 ? 'warning' : 'danger');

type Tab = 'trend' | 'product' | 'distributor' | 'employee' | 'statement';
const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'trend', label: 'Overview' },
  { value: 'product', label: 'By product' },
  { value: 'distributor', label: 'By distributor' },
  { value: 'employee', label: 'By employee' },
  { value: 'statement', label: 'Stock statement' },
];

/**
 * Sales one way at a time (decision-log 2026-11-03): by product, by distributor, by employee, each for a month, a quarter or the year of the
 * financial year in view. The old distributor-and-product stock statement is the last tab. Targets stay per employee; a product's is their sum.
 */
export function SalesReportScreen() {
  const { values, update } = useFilterParams(['tab', 'period', 'month', 'quarter', 'metric', 'distributorId', 'productId', 'search']);
  const { year } = useFinancialYear();
  const today = istDate();
  const fy = year ?? financialYearOf(today);
  const tabs = TABS;
  const tab = (tabs.find((t) => t.value === values.tab)?.value ?? tabs[0]!.value) as Tab;

  const period = parseSalesPeriod(values.period);
  const month = fyMonths(fy).includes(values.month) ? values.month : defaultMonth(fy, today.slice(0, 7));
  const quarter = Number(values.quarter) >= 1 && Number(values.quarter) <= 4 ? Number(values.quarter) : quarterOf(fy, today.slice(0, 7));
  const window: SalesWindowQuery = { year: fy, period, ...(period === 'month' && { month }), ...(period === 'quarter' && { quarter }) };
  const label = windowLabel(fy, period, month, quarter);
  const money = values.metric !== 'qty';

  const [productSort, setProductSort] = useState<SortState>({ key: 'secondary', order: 'desc' });
  const [employeeSort, setEmployeeSort] = useState<SortState>({ key: 'achieved', order: 'desc' });
  const product = useSalesByProduct(window, values.distributorId || undefined);
  const distributor = useSalesByDistributor(window, values.productId || undefined);
  const employee = useSalesByEmployee(window);
  const distributors = useDistributors({ page: 1, pageSize: 100, status: 'active' });
  const products = useActiveProducts();

  const productColumns: readonly Column<SalesByProductRowDto>[] = [
    { key: 'product', header: 'Product', sortable: true, render: (r) => <span className="font-medium">{r.product.name}</span> },
    { key: 'primary', header: 'Primary', numeric: true, sortable: true, render: (r) => (money ? formatMoney(r.primaryPaise) : qty(r.primaryQty)) },
    { key: 'secondary', header: 'Secondary', numeric: true, sortable: true, render: (r) => (money ? formatMoney(r.secondaryPaise) : qty(r.secondaryQty)) },
    { key: 'target', header: 'Target', numeric: true, sortable: true, render: (r) => (r.targetPaise > 0 ? formatMoney(r.targetPaise) : '—') },
    { key: 'ach', header: 'Achieved', numeric: true, sortable: true, render: (r) => <Badge tone={achievementTone(r.achievementPercent)}>{percent(r.achievementPercent)}</Badge> },
  ];
  const distributorColumns: readonly Column<SalesByDistributorRowDto>[] = [
    { key: 'distributor', header: 'Distributor', render: (r) => <span className="font-medium">{r.distributor.name}</span> },
    { key: 'primary', header: 'Primary', numeric: true, render: (r) => (money ? formatMoney(r.primaryPaise) : qty(r.primaryQty)) },
    { key: 'secondary', header: 'Secondary', numeric: true, render: (r) => (money ? formatMoney(r.secondaryPaise) : qty(r.secondaryQty)) },
    { key: 'products', header: 'Products', numeric: true, render: (r) => r.products },
    { key: 'counted', header: 'Counted', render: (r) => <Badge tone={r.countedMonths === 0 ? 'danger' : 'neutral'}>{r.countedMonths === 0 ? 'No count' : `${r.countedMonths} month${r.countedMonths === 1 ? '' : 's'}`}</Badge> },
  ];
  const employeeColumns: readonly Column<SalesByEmployeeRowDto>[] = [
    { key: 'employee', header: 'Employee', sortable: true, render: (r) => <span><Link href={`/reports/sales-dashboard/${r.employee.id}`} className="font-medium text-accent hover:underline">{r.employee.name}</Link> <span className="text-text-subtle">{r.employee.employeeCode}</span></span> },
    { key: 'designation', header: 'Designation', render: (r) => r.designation ?? '—' },
    { key: 'target', header: 'Target', numeric: true, sortable: true, render: (r) => (r.targetPaise > 0 ? formatMoney(r.targetPaise) : '—') },
    { key: 'primary', header: 'Primary', numeric: true, sortable: true, render: (r) => formatMoney(r.primaryPaise) },
    { key: 'achieved', header: 'Achieved', numeric: true, sortable: true, render: (r) => formatMoney(r.achievedPaise) },
    { key: 'ach', header: '%', numeric: true, sortable: true, render: (r) => <Badge tone={achievementTone(r.achievementPercent)}>{percent(r.achievementPercent)}</Badge> },
  ];

  const dir = (o: SortState) => (o.order === 'asc' ? 1 : -1);
  const productRows = (product.data?.rows ?? []).filter((r) => matchesSearch(values.search, r.product.name, r.product.sku)).sort((a, b) => {
    const v = (r: SalesByProductRowDto) => (productSort.key === 'primary' ? (money ? r.primaryPaise : r.primaryQty) : productSort.key === 'secondary' ? (money ? r.secondaryPaise : r.secondaryQty) : productSort.key === 'target' ? r.targetPaise : r.achievementPercent ?? -1);
    return productSort.key === 'product' ? dir(productSort) * a.product.name.localeCompare(b.product.name) : dir(productSort) * (v(a) - v(b)) || a.product.name.localeCompare(b.product.name);
  });
  const employeeRows = (employee.data?.rows ?? []).filter((r) => matchesSearch(values.search, r.employee.name, r.employee.employeeCode, r.designation)).sort((a, b) => {
    const v = (r: SalesByEmployeeRowDto) => (employeeSort.key === 'target' ? r.targetPaise : employeeSort.key === 'primary' ? r.primaryPaise : employeeSort.key === 'achieved' ? r.achievedPaise : r.achievementPercent ?? -1);
    return employeeSort.key === 'employee' ? dir(employeeSort) * a.employee.name.localeCompare(b.employee.name) : dir(employeeSort) * (v(a) - v(b)) || a.employee.name.localeCompare(b.employee.name);
  });

  const periodControls = (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex gap-1" role="group" aria-label="Period">
        {SALES_PERIOD_OPTIONS.map((o) => (
          <Button key={o.value} variant={period === o.value ? 'primary' : 'secondary'} aria-pressed={period === o.value} onClick={() => update({ period: o.value === 'year' ? '' : o.value })}>
            {o.label}
          </Button>
        ))}
      </div>
      {period === 'month' ? (
        <div className="w-48">
          <SearchableSelect aria-label="Month" searchPlaceholder="Search months" value={month} options={fyMonths(fy).map((m) => ({ value: m, label: monthLabel(m) }))} onValueChange={(v) => update({ month: v })} />
        </div>
      ) : null}
      {period === 'quarter' ? (
        <div className="w-64">
          <SearchableSelect aria-label="Quarter" searchPlaceholder="Search quarters" value={String(quarter)} options={QUARTER_OPTIONS(fy, monthLabel)} onValueChange={(v) => update({ quarter: v })} />
        </div>
      ) : null}
      <span className="text-sm text-text-muted">{financialYearLabel(fy)}</span>
      {tab !== 'employee' ? (
        <div className="ml-auto flex gap-1" role="group" aria-label="Show">
          <Button variant={money ? 'primary' : 'secondary'} aria-pressed={money} onClick={() => update({ metric: '' })}>Value (₹)</Button>
          <Button variant={!money ? 'primary' : 'secondary'} aria-pressed={!money} onClick={() => update({ metric: 'qty' })}>Quantity</Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Sales"
        description="Primary is what went to the distributors (Done orders); secondary is what they sold on, valued at PTS. Targets are set per employee; a product's target is the sum of its employees'."
      />
      <Tabs value={tab} onValueChange={(v) => update({ tab: v })}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        {tab !== 'statement' && tab !== 'trend' ? <div className="pt-4">{periodControls}</div> : null}

        <TabsContent value="trend">
          <SalesTrendTab fy={fy} />
        </TabsContent>

        <TabsContent value="product">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SearchInput label="Search products" placeholder="Search product or SKU" value={values.search} onChange={(v) => update({ search: v })} />
            <div className="w-64"><SearchableSelect aria-label="Distributor" searchPlaceholder="Search distributors" value={values.distributorId || ANY} options={[{ value: ANY, label: 'All distributors' }, ...(distributors.data?.items ?? []).map((d) => ({ value: d.id, label: d.name }))]} onValueChange={(v) => update({ distributorId: v === ANY ? '' : v })} /></div>
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Primary" value={formatMoney(product.data?.totals.primaryPaise ?? 0)} note={`${qty(product.data?.totals.primaryQty ?? 0)} units`} />
            <StatTile label="Secondary" value={formatMoney(product.data?.totals.secondaryPaise ?? 0)} note={`${qty(product.data?.totals.secondaryQty ?? 0)} units`} />
            <StatTile label="Product targets" value={formatMoney(product.data?.totals.targetPaise ?? 0)} note="sum of employee targets" />
            <StatTile label="All-products targets" value={formatMoney(product.data?.generalTargetPaise ?? 0)} note="not tied to one product" />
          </div>
          <Card title={`Sales by product, ${label}`} actions={<div className="flex gap-2"><Button variant="secondary" size="sm" disabled={!product.data} onClick={() => product.data && void downloadXlsx(salesBreakdownFilename('product', label), 'Sales by product', ...productSheet(product.data))}>Download Excel</Button><Button variant="secondary" size="sm" disabled={!product.data} onClick={() => product.data && downloadCsv(salesBreakdownFilename('product', label), productCsv(product.data))}>Download CSV</Button></div>}>
            <DataState isLoading={product.isLoading} isFetching={product.isFetching} error={product.error ? toErrorState(product.error, () => void product.refetch()) : null} isEmpty={productRows.length === 0} empty={{ title: values.search ? 'No product matches your search' : 'No sales in this period' }}>
              <DataTable columns={productColumns} rows={productRows} rowKey={(r) => r.product.id} sort={productSort} onSortChange={setProductSort} bleed={false} />
            </DataState>
          </Card>
        </TabsContent>

        <TabsContent value="distributor">
          <div className="mb-4 w-64">
            <SearchableSelect aria-label="Product" searchPlaceholder="Search products" value={values.productId || ANY} options={[{ value: ANY, label: 'All products' }, ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))]} onValueChange={(v) => update({ productId: v === ANY ? '' : v })} />
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatTile label="Primary" value={formatMoney(distributor.data?.totals.primaryPaise ?? 0)} note={`${qty(distributor.data?.totals.primaryQty ?? 0)} units`} />
            <StatTile label="Secondary" value={formatMoney(distributor.data?.totals.secondaryPaise ?? 0)} note={`${qty(distributor.data?.totals.secondaryQty ?? 0)} units`} />
            <StatTile label="No count at all" value={`${distributor.data?.missingDistributors.length ?? 0}`} note="distributors in this period" {...((distributor.data?.missingDistributors.length ?? 0) > 0 ? { tone: 'warning' as const } : {})} />
          </div>
          <Card title={`Sales by distributor, ${label}`} actions={<div className="flex gap-2"><Button variant="secondary" size="sm" disabled={!distributor.data} onClick={() => distributor.data && void downloadXlsx(salesBreakdownFilename('distributor', label), 'Sales by distributor', ...distributorSheet(distributor.data))}>Download Excel</Button><Button variant="secondary" size="sm" disabled={!distributor.data} onClick={() => distributor.data && downloadCsv(salesBreakdownFilename('distributor', label), distributorCsv(distributor.data))}>Download CSV</Button></div>}>
            <DataState isLoading={distributor.isLoading} isFetching={distributor.isFetching} error={distributor.error ? toErrorState(distributor.error, () => void distributor.refetch()) : null} isEmpty={(distributor.data?.rows.length ?? 0) === 0} empty={{ title: 'No sales in this period' }}>
              <DataTable columns={distributorColumns} rows={distributor.data?.rows ?? []} rowKey={(r) => r.distributor.id} bleed={false} />
            </DataState>
          </Card>
        </TabsContent>

        <TabsContent value="employee">
          <div className="mb-4">
            <SearchInput label="Search employees" placeholder="Search name, code or designation" value={values.search} onChange={(v) => update({ search: v })} />
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatTile label="Target" value={formatMoney(employee.data?.totals.targetPaise ?? 0)} />
            <StatTile label="Achieved" value={formatMoney(employee.data?.totals.achievedPaise ?? 0)} note={`${percent(employee.data?.totals.achievementPercent ?? null)} of target`} />
            <StatTile label="Primary" value={formatMoney(employee.data?.totals.primaryPaise ?? 0)} note="each MR counted once" />
          </div>
          <Card title={`Sales by employee, ${label}`} description="A distributor shared by two employees counts in full for each, so rows can add up to more than the total." actions={<div className="flex gap-2"><Button variant="secondary" size="sm" disabled={!employee.data} onClick={() => employee.data && void downloadXlsx(salesBreakdownFilename('employee', label), 'Sales by employee', ...employeeSheet(employee.data))}>Download Excel</Button><Button variant="secondary" size="sm" disabled={!employee.data} onClick={() => employee.data && downloadCsv(salesBreakdownFilename('employee', label), employeeCsv(employee.data))}>Download CSV</Button></div>}>
            <DataState isLoading={employee.isLoading} isFetching={employee.isFetching} error={employee.error ? toErrorState(employee.error, () => void employee.refetch()) : null} isEmpty={employeeRows.length === 0} empty={{ title: values.search ? 'No employee matches your search' : 'No employees to show' }}>
              <DataTable columns={employeeColumns} rows={employeeRows} rowKey={(r) => r.employee.id} sort={employeeSort} onSortChange={setEmployeeSort} bleed={false} />
            </DataState>
          </Card>
        </TabsContent>

        <TabsContent value="statement">
          <div className="pt-4">
            <SalesStatementScreen />
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
