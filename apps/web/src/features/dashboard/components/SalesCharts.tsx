'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Bar, BarChart, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Skeleton } from '@/components/ui/Skeleton';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useSalesByEmployee, useSalesByProduct } from '@/features/reports/hooks/useSalesReport';
import { QUARTER_OPTIONS, SALES_PERIOD_OPTIONS, defaultMonth, fyMonths, quarterOf, windowLabel, type SalesPeriod } from '@/features/reports/lib/salesBreakdown';
import { toErrorState } from '@/lib/api/toErrorState';
import type { SalesWindowQuery } from '@/lib/api/endpoints/reports';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { achievementSlices, employeeTargets, pieSlices, productTargets, rankedEmployees, rankedProducts, topAchievers, type RankedRow, type TargetBar } from '../lib/salesCharts';

const ACHIEVED = 'var(--color-accent)';
const REMAINING = 'var(--color-border-strong)';

function Donut({ target, achieved, label }: { target: number; achieved: number; label: string }) {
  const s = achievementSlices(target, achieved);
  const data = [
    { name: 'Achieved', value: s.achievedPaise, fill: ACHIEVED },
    { name: 'Remaining', value: s.remainingPaise, fill: REMAINING },
  ];
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-40 shrink-0" role="img" aria-label={`${label}: ${s.percent === null ? 'no target' : `${s.percent}% of target`}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius="68%" outerRadius="100%" stroke="none" isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => formatMoney(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xl font-semibold text-text">{s.percent === null ? '—' : `${s.percent}%`}</div>
      </div>
      <dl className="space-y-1 text-sm">
        <div>
          <dt className="text-text-subtle">Target</dt>
          <dd className="font-medium">{target > 0 ? formatMoney(target) : 'Not set'}</dd>
        </div>
        <div>
          <dt className="text-text-subtle">Achieved</dt>
          <dd className="font-medium">{formatMoney(achieved)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** A donut for one product or employee, picked from those with a target (largest first). */
function PickDonut({ title, items, noun }: { title: string; items: TargetBar[]; noun: string }) {
  const [picked, setPicked] = useState('');
  const item = items.find((i) => i.id === picked) ?? items[0];
  return (
    <div className="space-y-3">
      <SearchableSelect aria-label={`Choose ${noun}`} searchPlaceholder={`Search ${noun}s`} value={item?.id ?? ''} options={items.map((i) => ({ value: i.id, label: i.label }))} onValueChange={setPicked} />
      {item ? <Donut target={item.targetPaise} achieved={item.achievedPaise} label={`${title}, ${item.label}`} /> : null}
    </div>
  );
}

function RankedBars({ rows, label }: { rows: RankedRow[]; label: string }) {
  return (
    <div className="h-64" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--color-text-subtle)' }} />
          <Tooltip formatter={(v: number) => formatMoney(v)} cursor={{ fill: 'var(--color-surface-hover)' }} />
          <Bar dataKey="valuePaise" name="Sales" fill={ACHIEVED} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const PIE_COLOURS = ['var(--color-accent)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)', 'var(--color-neutral-500)', 'var(--color-border-strong)'];

/** Each product's share of sales: top five, the rest as Others. The legend carries the names and amounts. */
function SharePie({ rows, label }: { rows: RankedRow[]; label: string }) {
  const total = rows.reduce((sum, r) => sum + r.valuePaise, 0);
  return (
    <div className="flex flex-wrap items-center gap-4" role="img" aria-label={label}>
      <div className="size-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="valuePaise" nameKey="label" outerRadius="100%" stroke="var(--color-surface)" isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell key={r.id} fill={PIE_COLOURS[i % PIE_COLOURS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => formatMoney(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-40 flex-1 space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: PIE_COLOURS[i % PIE_COLOURS.length] }} />
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            <span className="text-text-subtle">{total > 0 ? `${Math.round((r.valuePaise / total) * 100)}%` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The whole ranking, most sales first, scrolling inside the card. */
function RankList({ rows }: { rows: RankedRow[] }) {
  return (
    <ol className="max-h-80 divide-y divide-border overflow-y-auto">
      {rows.map((r, i) => (
        <li key={r.id} className="flex items-center gap-3 px-5 py-2 text-sm">
          <span className="w-6 text-right text-text-subtle">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
          <span className="tabular-nums">{formatMoney(r.valuePaise)}</span>
        </li>
      ))}
    </ol>
  );
}

const chartSkeleton = <Skeleton className="h-40 w-full" />;

/**
 * The org's sales against target (decision-log 2026-11-04): overall, then per product and per employee as donuts, then the top achievers and top
 * products. Built on the by-product and by-employee reports, so a chart's figures are the report's. Each chart has its own query and fails alone.
 */
export function SalesCharts() {
  const { year } = useFinancialYear();
  const today = istDate();
  const fy = year ?? financialYearOf(today);
  const thisMonth = today.slice(0, 7);
  const [period, setPeriod] = useState<SalesPeriod>('year');
  const [month, setMonth] = useState(defaultMonth(fy, thisMonth));
  const [quarter, setQuarter] = useState(quarterOf(fy, thisMonth));
  const validMonth = fyMonths(fy).includes(month) ? month : defaultMonth(fy, thisMonth);

  const window: SalesWindowQuery = { year: fy, period, ...(period === 'month' && { month: validMonth }), ...(period === 'quarter' && { quarter }) };
  const product = useSalesByProduct(window);
  const employee = useSalesByEmployee(window);
  const when = windowLabel(fy, period, validMonth, quarter);

  const state = (q: typeof product | typeof employee, isEmpty: boolean) => ({
    isLoading: q.isLoading,
    error: q.error ? toErrorState(q.error, () => void q.refetch()) : null,
    isEmpty,
    skeleton: chartSkeleton,
  });
  const none = { title: 'No sales data for this period' };

  return (
    <section className="space-y-4" aria-label="Sales against target">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold text-text">Sales · {when}</h2>
        <div className="flex gap-1" role="group" aria-label="Period">
          {SALES_PERIOD_OPTIONS.map((o) => (
            <Button key={o.value} variant={period === o.value ? 'primary' : 'secondary'} aria-pressed={period === o.value} onClick={() => setPeriod(o.value)}>
              {o.label}
            </Button>
          ))}
        </div>
        {period === 'month' ? (
          <div className="w-48">
            <SearchableSelect aria-label="Month" searchPlaceholder="Search months" value={validMonth} options={fyMonths(fy).map((m) => ({ value: m, label: monthLabel(m) }))} onValueChange={setMonth} />
          </div>
        ) : null}
        {period === 'quarter' ? (
          <div className="w-64">
            <SearchableSelect aria-label="Quarter" searchPlaceholder="Search quarters" value={String(quarter)} options={QUARTER_OPTIONS(fy, monthLabel)} onValueChange={(v) => setQuarter(Number(v))} />
          </div>
        ) : null}
        <Link href="/reports/sales" className="ml-auto text-sm font-medium text-accent hover:underline">View full sales report →</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Overall" description="All employees' targets vs achieved">
          <div className="p-5">
            <DataState {...state(employee, false)} empty={none}>
              {employee.data ? <Donut target={employee.data.totals.targetPaise} achieved={employee.data.totals.achievedPaise} label="Overall" /> : null}
            </DataState>
          </div>
        </Card>
        <Card title="By employee" description="Pick an employee with a target">
          <div className="p-5">
            <DataState {...state(employee, employee.data ? employeeTargets(employee.data).length === 0 : false)} empty={{ title: 'No employee targets set' }}>
              {employee.data ? <PickDonut title="By employee" noun="employee" items={employeeTargets(employee.data)} /> : null}
            </DataState>
          </div>
        </Card>
        <Card title="By product" description="Pick a product with a target">
          <div className="p-5">
            <DataState {...state(product, product.data ? productTargets(product.data).length === 0 : false)} empty={{ title: 'No product targets set' }}>
              {product.data ? <PickDonut title="By product" noun="product" items={productTargets(product.data)} /> : null}
            </DataState>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top achievers" description="Employees by achieved sales">
          <div className="p-5">
            <DataState {...state(employee, employee.data ? topAchievers(employee.data).length === 0 : false)} empty={none}>
              {employee.data ? <RankedBars rows={topAchievers(employee.data)} label={`Top achievers, ${when}`} /> : null}
            </DataState>
          </div>
        </Card>
        <Card title="Top products" description="Share of secondary sales">
          <div className="p-5">
            <DataState {...state(product, product.data ? pieSlices(rankedProducts(product.data)).length === 0 : false)} empty={none}>
              {product.data ? <SharePie rows={pieSlices(rankedProducts(product.data))} label={`Top products, ${when}`} /> : null}
            </DataState>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Employees by sales" description="Most to least, achieved">
          <DataState {...state(employee, employee.data ? employee.data.rows.length === 0 : false)} empty={none}>
            {employee.data ? <RankList rows={rankedEmployees(employee.data)} /> : null}
          </DataState>
        </Card>
        <Card title="Products by sales" description="Most to least, secondary sales">
          <DataState {...state(product, product.data ? product.data.rows.length === 0 : false)} empty={none}>
            {product.data ? <RankList rows={rankedProducts(product.data)} /> : null}
          </DataState>
        </Card>
      </div>
    </section>
  );
}
