'use client';

import type { StockReportRowDto } from '@greynote/contracts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { monthsInYear } from '@/features/attendance/lib/attendance';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { toErrorState } from '@/lib/api/toErrorState';
import { downloadCsv } from '@/lib/csv';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useFinancialYear } from '@/lib/useFinancialYear';
import { useStockReport } from '../hooks/useSalesReport';
import { STOCK_FLAG_LABEL, stockCsv, stockFilename } from '../lib/sales';

const qty = (n: number | null): string => (n === null ? '—' : n.toLocaleString('en-IN'));

/**
 * The month's stock counts of every distributor and chemist for the financial year in view (sign-off K28): who has counted and who has not, and what
 * does not add up — an opening that is not last month's closing, and, for a distributor, a secondary below zero. A chemist's counts are information.
 */
export function StockReportScreen() {
  const { values, update } = useFilterParams(['month', 'only']);
  const { year } = useFinancialYear();
  const today = istDate();
  const months = monthsInYear(year ?? financialYearOf(today), today);
  const month = months.includes(values.month) ? values.month : (months[0] ?? '');
  const onlyFlagged = values.only === 'flagged';
  const query = useStockReport(month);
  const report = query.data;
  const rows = (report?.rows ?? []).filter((r) => !onlyFlagged || r.flags.length > 0);

  const columns: readonly Column<StockReportRowDto>[] = [
    { key: 'type', header: 'Outlet', render: (r) => <Badge tone={r.outletType === 'DISTRIBUTOR' ? 'accent' : 'neutral'}>{r.outletType === 'DISTRIBUTOR' ? 'Distributor' : 'Chemist'}</Badge> },
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.outlet.name}</span> },
    { key: 'product', header: 'Product', render: (r) => r.product?.name ?? <span className="text-text-subtle">—</span> },
    { key: 'last', header: 'Last month closing', numeric: true, render: (r) => qty(r.previousClosingQty) },
    { key: 'opening', header: 'Opening', numeric: true, render: (r) => qty(r.openingQty) },
    { key: 'closing', header: 'Closing', numeric: true, render: (r) => qty(r.closingQty) },
    {
      key: 'flags',
      header: '',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.flags.map((f) => (
            <Badge key={f} tone={f === 'NO_COUNT' ? 'warning' : 'danger'}>
              {STOCK_FLAG_LABEL[f]}
            </Badge>
          ))}
        </div>
      ),
    },
  ];

  const c = report?.completeness;
  return (
    <>
      <PageHeader
        title="Stock"
        description="Each month's opening and closing counts of the distributors and chemists: who has counted, and what does not add up."
        actions={
          <Button variant="secondary" disabled={!report || report.rows.length === 0} onClick={() => report && downloadCsv(stockFilename(month), stockCsv(report))}>
            Download CSV
          </Button>
        }
      />
      {months.length === 0 ? (
        <Card>
          <p className="p-6 text-sm text-text-muted">No month of this financial year has started yet.</p>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="w-52">
              <Select aria-label="Month" value={month} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} onValueChange={(v) => update({ month: v })} />
            </div>
            <Button variant={onlyFlagged ? 'primary' : 'secondary'} aria-pressed={onlyFlagged} onClick={() => update({ only: onlyFlagged ? '' : 'flagged' })}>
              Only what needs attention
            </Button>
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatTile label="Distributors counted" value={c ? `${c.distributors.counted} of ${c.distributors.expected}` : '—'} tone={c && c.distributors.counted < c.distributors.expected ? 'warning' : 'success'} />
            <StatTile label="Chemists counted" value={c ? `${c.chemists.counted} of ${c.chemists.expected}` : '—'} note="information only" tone={c && c.chemists.counted < c.chemists.expected ? 'warning' : 'success'} />
            <StatTile label="Rows needing attention" value={report?.flagged ?? 0} tone={report && report.flagged > 0 ? 'danger' : undefined} />
          </div>
          <Card>
            <DataState
              isLoading={query.isLoading}
              error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
              isEmpty={rows.length === 0}
              empty={{ title: onlyFlagged ? 'Nothing needs attention' : `No outlets for ${monthLabel(month)}`, description: onlyFlagged ? 'Every count adds up.' : 'There are no active distributors or chemists.' }}
            >
              <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.outletType}|${r.outlet.id}|${r.product?.id ?? 'none'}`} />
            </DataState>
          </Card>
        </>
      )}
    </>
  );
}
