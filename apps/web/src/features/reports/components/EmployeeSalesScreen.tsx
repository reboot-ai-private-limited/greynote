'use client';

import type { EmployeeDistributorFigureDto, EmployeeProductFigureDto, EmployeeTargetFigureDto } from '@greynote/contracts';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatTile } from '@/components/ui/StatTile';
import { toErrorState } from '@/lib/api/toErrorState';
import { useSession } from '@/lib/auth/SessionProvider';
import { istDate } from '@/lib/dates';
import { financialYearLabel, financialYearOf } from '@/lib/financial-year';
import { withAuth } from '@/lib/auth/session';
import { reportsApi } from '@/lib/api/endpoints/reports';
import { downloadBlob } from '@/lib/download';
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { useDeleteTarget, useEmployeeSalesReport } from '../hooks/useEmployeeSales';
import { PERIOD_OPTIONS, parsePeriod, periodMonths, rangeLabel } from '../lib/employeeSales';
import { financialYearMonths } from '../lib/salesDashboard';
import { AddTargetDialog } from './AddTargetDialog';

const money = (paise: number): string => formatMoney(paise);
const percent = (p: number | null): string => (p === null ? '—' : `${p}%`);
const FLAG_TEXT = { NO_PTS: 'No PTS: secondary not valued', NO_PTS_CHANGE: 'No PTS: change not valued' } as const;

/**
 * One employee over a run of months: their targets (product by product, over any months of the year), what their Done orders came to (primary)
 * and what they sold (secondary, which is their achievement). Admin sees anyone, a manager their team.
 */
export function EmployeeSalesScreen({ userId }: { userId: string }) {
  const { values, update } = useFilterParams(['period', 'from', 'to']);
  const { user: me } = useSession();
  const { year } = useFinancialYear();
  const readOnly = useIsReadOnly();
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
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EmployeeTargetFigureDto | null>(null);
  const [removing, setRemoving] = useState<EmployeeTargetFigureDto | null>(null);
  const remove = useDeleteTarget(() => setRemoving(null));
  // A manager's target is the total of their MRs, so there is nothing to set (or remove) on a manager.
  const canSetTargets = !data?.team && (me?.role === 'ADMIN' || me?.role === 'HR');
  const name = data?.employee.name ?? 'Employee';

  const monthOptions = fyMonths.map((m) => ({ value: m, label: monthLabel(m) }));
  const distributorColumns: readonly Column<EmployeeDistributorFigureDto>[] = [
    { key: 'distributor', header: 'Distributor', render: (d) => <span className="font-medium">{d.distributor.name}</span> },
    { key: 'qty', header: 'Units delivered', numeric: true, render: (d) => d.orderQty.toLocaleString('en-IN') },
    { key: 'paise', header: 'Primary (₹)', numeric: true, render: (d) => money(d.orderPaise) },
  ];
  const productColumns: readonly Column<EmployeeProductFigureDto>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (p) => (
        <>
          <span className="font-medium">{p.product.name}</span>{' '}
          {p.flags.map((f) => (
            <Badge key={f} tone="warning">
              {FLAG_TEXT[f]}
            </Badge>
          ))}
        </>
      ),
    },
    { key: 'target', header: 'Target', numeric: true, render: (p) => (p.targetPaise ? money(p.targetPaise) : '—') },
    { key: 'primary', header: 'Primary', numeric: true, render: (p) => `${p.primaryQty} · ${money(p.primaryPaise)}` },
    { key: 'secondary', header: 'Secondary', numeric: true, render: (p) => `${p.secondaryQty} · ${money(p.secondaryPaise)}` },
    { key: 'pct', header: 'Achievement', numeric: true, render: (p) => percent(p.achievementPercent) },
  ];
  const targetColumns: readonly Column<EmployeeTargetFigureDto>[] = [
    { key: 'product', header: 'Product', render: (t) => t.product?.name ?? 'All products' },
    { key: 'months', header: 'Months', render: (t) => rangeLabel(t.fromMonth, t.toMonth) },
    { key: 'amount', header: 'Target', numeric: true, render: (t) => money(t.amountPaise) },
    { key: 'achieved', header: 'Achieved', numeric: true, render: (t) => money(t.achievedPaise) },
    { key: 'pct', header: '%', numeric: true, render: (t) => percent(t.achievementPercent) },
    { key: 'qty', header: 'Units (achieved / target)', numeric: true, render: (t) => (t.targetQty === null ? '—' : `${t.achievedQty} / ${t.targetQty} · ${percent(t.achievementQtyPercent)}`) },
    ...(canSetTargets
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-24 text-right',
            render: (t: EmployeeTargetFigureDto) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" disabled={readOnly} aria-label={`Edit the ${t.product?.name ?? 'all products'} target`} title="Edit" onClick={() => setEditing(t)}>
                  <Pencil aria-hidden className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" disabled={readOnly} aria-label={`Remove the ${t.product?.name ?? 'all products'} target`} title="Remove" onClick={() => setRemoving(t)}>
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </div>
            ),
          } satisfies Column<EmployeeTargetFigureDto>,
        ]
      : []),
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
            <Button variant="secondary" disabled={sheetBusy} onClick={() => void downloadSheet()}>
              {sheetBusy ? 'Preparing…' : `Download Excel · ${financialYearLabel(sheetYear)}`}
            </Button>
            {canSetTargets ? (
              <Button disabled={readOnly} onClick={() => setAdding(true)}>
                <Plus aria-hidden className="size-4" /> Set a target
              </Button>
            ) : null}
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

      <DataState
        isLoading={!bad && query.isLoading}
        isFetching={query.isFetching}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={false}
        empty={{ title: '', description: '' }}
      >
        <div className="space-y-6">
          <Card title="Targets" description="Each one is measured over its own months.">
            {data && data.targets.length > 0 ? (
              <DataTable columns={targetColumns} rows={data.targets} rowKey={(t) => t.id} bleed={false} />
            ) : (
              <p className="px-5 py-6 text-[13px] text-text-muted">
                {data?.team
                  ? data.team.mrCount === 0
                    ? 'No MRs under them yet, so there is nothing to add up.'
                    : 'No target touches these months. Set targets on the MRs; a manager’s is their total.'
                  : `No target touches these months${canSetTargets ? '. Use “Set a target”.' : '.'}`}
              </p>
            )}
          </Card>
          <Card title="By product" description="Primary is what the MRs received and secondary what they issued, both as approved and valued at PTS: secondary is the achievement.">
            {data && data.products.length > 0 ? (
              <DataTable columns={productColumns} rows={data.products} rowKey={(p) => p.product.id} bleed={false} />
            ) : (
              <p className="px-5 py-6 text-[13px] text-text-muted">Nothing ordered or entered in these months yet.</p>
            )}
          </Card>
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

      {adding ? (
        <AddTargetDialog userId={userId} name={name} from={range.from} to={range.to} onClose={() => setAdding(false)} />
      ) : null}
      {editing ? (
        <AddTargetDialog key={editing.id} userId={userId} name={name} from={range.from} to={range.to} target={editing} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this target?"
        description={removing ? `${removing.product?.name ?? 'All products'}, ${rangeLabel(removing.fromMonth, removing.toMonth)}: ${money(removing.amountPaise)}.` : undefined}
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </>
  );
}
