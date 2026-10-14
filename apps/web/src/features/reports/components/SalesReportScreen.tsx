'use client';

import type { SalesMonthDto, SalesStatementRowDto } from '@greynote/contracts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useDistributors } from '@/features/field-master-data/hooks/useDistributors';
import { useActiveProducts } from '@/features/field-master-data/hooks/useProducts';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv } from '@/lib/csv';
import { istDate } from '@/lib/dates';
import { financialYearLabel, financialYearOf } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useSalesStatement, useSalesYear } from '../hooks/useSalesReport';
import { SALES_FLAG_LABEL, SOURCE_LABEL, monthNote, salesFilename, salesMonthsCsv, statementCsv, statementFilename } from '../lib/sales';
import { monthTick, type Metric } from '../lib/salesChart';
import { SalesBarChart } from './SalesBarChart';

const ANY = 'all';

const qty = (n: number | null): string => (n === null ? '—' : n.toLocaleString('en-IN'));
const money = (paise: number | null): string => (paise === null ? '—' : formatMoney(paise));

/**
 * Primary and secondary sales for the financial year in view (sign-off K9, K21, K22, K27, K29, K31). Primary is every Done order to a distributor,
 * in the month it was marked Done; secondary is what the distributors sold on, worked out from their stock counts (opening + primary − closing) and
 * valued at PTS. The chart is the year; clicking a month opens its stock and sales statement beneath it.
 */
export function SalesReportScreen() {
  const { values, update } = useFilterParams(['month', 'metric', 'distributorId', 'productId']);
  const { year } = useFinancialYear();
  const today = istDate();
  const fy = year ?? financialYearOf(today);
  const metric: Metric = values.metric === 'qty' ? 'QTY' : 'VALUE';
  const filters = { ...(values.distributorId && { distributorId: values.distributorId }), ...(values.productId && { productId: values.productId }) };

  const report = useSalesYear(fy, filters);
  const months = report.data?.months ?? [];
  // The month shown below: the one asked for, or the latest that has ended (the month in progress has no stock counts yet), or the one in progress.
  const started = months.filter((m) => m.state !== 'FUTURE');
  const selected = started.find((m) => m.month === values.month)?.month ?? started.filter((m) => m.state === 'ENDED').at(-1)?.month ?? started.at(-1)?.month ?? '';
  const statement = useSalesStatement(selected, filters);

  const distributors = useDistributors({ page: 1, pageSize: 100, status: 'active' });
  const products = useActiveProducts();

  const monthColumns: readonly Column<SalesMonthDto>[] = [
    { key: 'month', header: 'Month', render: (m) => <button type="button" className="font-medium text-text hover:text-accent hover:underline" onClick={() => update({ month: m.month })}>{monthTick(m.month)}</button> },
    { key: 'primary', header: 'Primary', numeric: true, render: (m) => (m.state === 'FUTURE' ? '—' : metric === 'VALUE' ? formatMoney(m.primaryPaise) : qty(m.primaryQty)) },
    { key: 'secondary', header: 'Secondary', numeric: true, render: (m) => (m.state === 'FUTURE' || m.secondaryQty === null ? '—' : metric === 'VALUE' ? money(m.secondaryPaise) : qty(m.secondaryQty)) },
    { key: 'placed', header: 'Placed, not done', numeric: true, render: (m) => (m.state === 'FUTURE' ? '—' : metric === 'VALUE' ? formatMoney(m.placedPaise) : qty(m.placedQty)) },
    {
      key: 'counted',
      header: 'Counted',
      render: (m) => (m.state === 'ENDED' ? <Badge tone={m.complete ? 'success' : m.countedDistributors === 0 ? 'danger' : 'warning'}>{`${m.countedDistributors} of ${m.expectedDistributors}`}</Badge> : <span className="text-text-subtle">—</span>),
    },
  ];

  const rowColumns: readonly Column<SalesStatementRowDto>[] = [
    { key: 'distributor', header: 'Distributor', render: (r) => <span className="font-medium">{r.distributor.name}</span> },
    { key: 'product', header: 'Product', render: (r) => r.product.name },
    { key: 'opening', header: 'Opening', numeric: true, render: (r) => qty(r.openingQty) },
    { key: 'primary', header: 'Primary', numeric: true, render: (r) => (metric === 'VALUE' ? formatMoney(r.primaryPaise) : qty(r.primaryQty)) },
    {
      key: 'adjustment',
      header: 'Of which adjustment',
      numeric: true,
      render: (r) => (r.adjustmentQty === 0 ? <span className="text-text-subtle">—</span> : <span title={`${r.orderPrimaryQty} from orders`}>{r.adjustmentQty > 0 ? `+${r.adjustmentQty}` : r.adjustmentQty}</span>),
    },
    { key: 'closing', header: 'Closing', numeric: true, render: (r) => qty(r.closingQty) },
    { key: 'secondary', header: 'Secondary', numeric: true, render: (r) => (metric === 'VALUE' ? money(r.secondaryPaise) : qty(r.secondaryQty)) },
    {
      key: 'source',
      header: 'From',
      render: (r) => (r.source === 'NONE' ? <span className="text-text-subtle">—</span> : <Badge tone={r.source === 'STATEMENT' ? 'accent' : 'neutral'}>{SOURCE_LABEL[r.source]}</Badge>),
    },
    {
      key: 'flags',
      header: '',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.flags.map((f) => (
            <Badge key={f} tone={f === 'NO_COUNT' || f === 'UNPRICED' || f === 'COUNT_MISMATCH' ? 'warning' : 'danger'}>
              {SALES_FLAG_LABEL[f]}
            </Badge>
          ))}
        </div>
      ),
    },
  ];

  const selectedMonth = months.find((m) => m.month === selected);
  const s = statement.data;
  return (
    <>
      <PageHeader
        title="Sales"
        description={`Primary and secondary sales, ${financialYearLabel(fy)}. Primary is what went to the distributors (Done orders); secondary is what they sold on, from the distributor's statement when Admin entered one, otherwise from the field workers' stock counts.`}
        actions={
          <Button variant="secondary" disabled={!report.data} onClick={() => report.data && downloadCsv(salesFilename(fy), salesMonthsCsv(report.data))}>
            Download CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="group" aria-label="Show">
          <Button variant={metric === 'VALUE' ? 'primary' : 'secondary'} aria-pressed={metric === 'VALUE'} onClick={() => update({ metric: '' })}>
            Value (₹)
          </Button>
          <Button variant={metric === 'QTY' ? 'primary' : 'secondary'} aria-pressed={metric === 'QTY'} onClick={() => update({ metric: 'qty' })}>
            Quantity
          </Button>
        </div>
        <div className="w-60">
          <Select
            aria-label="Distributor"
            value={values.distributorId || ANY}
            options={[{ value: ANY, label: 'All distributors' }, ...(distributors.data?.items ?? []).map((d) => ({ value: d.id, label: d.name }))]}
            onValueChange={(v) => update({ distributorId: v === ANY ? '' : v })}
          />
        </div>
        <div className="w-60">
          <Select
            aria-label="Product"
            value={values.productId || ANY}
            options={[{ value: ANY, label: 'All products' }, ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name }))]}
            onValueChange={(v) => update({ productId: v === ANY ? '' : v })}
          />
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Primary, year to date" value={formatMoney(report.data?.totals.primaryPaise ?? 0)} note={`${qty(report.data?.totals.primaryQty ?? 0)} units`} />
        <StatTile label="Secondary, year to date" value={formatMoney(report.data?.totals.secondaryPaise ?? 0)} note={`${qty(report.data?.totals.secondaryQty ?? 0)} units, from the stock counted`} />
        <StatTile label="Placed, not yet done" value={formatMoney(months.reduce((n, m) => n + m.placedPaise, 0))} note="not in primary until Done" tone="warning" />
        <StatTile label="Months with a gap" value={`${started.filter((m) => m.state === 'ENDED' && !m.complete).length}`} note="some distributor has not counted" tone={started.some((m) => m.state === 'ENDED' && !m.complete) ? 'warning' : undefined} />
      </div>

      <Card title="By month" description="Click a month to see its statement below.">
        <div className="p-5">
          <DataState
            isLoading={report.isLoading}
            error={report.error ? toErrorState(report.error, () => void report.refetch()) : null}
            isEmpty={months.length === 0}
            empty={{ title: 'No sales data' }}
          >
            <SalesBarChart months={months} metric={metric} selected={selected} onSelect={(m) => update({ month: m })} />
            <div className="mt-4 overflow-hidden rounded-md border border-border">
              <DataTable columns={monthColumns} rows={started} rowKey={(m) => m.month} bleed={false} />
            </div>
          </DataState>
        </div>
      </Card>

      {selected ? (
        <Card
          title={`${monthLabel(selected)}: stock and sales`}
          {...(selectedMonth ? { description: monthNote(selectedMonth) } : {})}
          actions={
            <Button variant="secondary" size="sm" disabled={!s} onClick={() => s && downloadCsv(statementFilename(selected), statementCsv(s))}>
              Download CSV
            </Button>
          }
          className="mt-6"
        >
          <DataState
            isLoading={statement.isLoading}
            error={statement.error ? toErrorState(statement.error, () => void statement.refetch()) : null}
            isEmpty={!s || (s.rows.length === 0 && s.missingDistributors.length === 0)}
            empty={{ title: 'Nothing this month', description: 'No order to a distributor and no stock count.' }}
          >
            {s ? (
              <div className="space-y-4 p-5">
                {s.missingDistributors.length > 0 && selectedMonth?.state === 'ENDED' ? (
                  <p role="status" className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg">
                    No stock count from {s.missingDistributors.map((d) => d.name).join(', ')}. Their secondary is not in the figures.
                  </p>
                ) : null}
                <div className="overflow-hidden rounded-md border border-border">
                  <DataTable columns={rowColumns} rows={s.rows} rowKey={(r) => `${r.distributor.id}|${r.product.id}`} bleed={false} />
                </div>
                <p className="text-sm text-text-muted">
                  Totals: primary {formatMoney(s.totals.primaryPaise)} ({qty(s.totals.primaryQty)} units) · secondary {formatMoney(s.totals.secondaryPaise)} ({qty(s.totals.secondaryQty)} units) · placed, not done {formatMoney(s.totals.placedPaise)}
                </p>
              </div>
            ) : null}
          </DataState>
        </Card>
      ) : null}
    </>
  );
}
