'use client';

import type { EmployeeProductFigureDto, EmployeeTargetFigureDto } from '@greynote/contracts';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
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
import { financialYearOf } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { useDeleteTarget, useEmployeeSalesReport } from '../hooks/useEmployeeSales';
import { PERIOD_OPTIONS, parsePeriod, periodMonths, rangeLabel } from '../lib/employeeSales';
import { financialYearMonths } from '../lib/salesDashboard';
import { AddTargetDialog } from './AddTargetDialog';
import { EmployeeMonthGrid } from './EmployeeMonthGrid';

const money = (paise: number): string => formatMoney(paise);
const percent = (p: number | null): string => (p === null ? '—' : `${p}%`);
const FLAG_TEXT = { NO_PTR: 'No PTR: secondary not valued', NO_PTS: 'No PTS: change not valued' } as const;

/**
 * One employee over a run of months: their targets (product by product, over any months of the year), what their Done orders came to (primary)
 * and what they sold (secondary, which is their achievement). Below, the month by month entry. Admin sees anyone, a manager their team.
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
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<EmployeeTargetFigureDto | null>(null);
  const remove = useDeleteTarget(() => setRemoving(null));
  const enterable = fyMonths.filter((m) => m <= thisMonth);
  const [month, setMonth] = useState(
    enterable.includes(thisMonth) ? thisMonth : (enterable[enterable.length - 1] ?? thisMonth),
  );
  const canSetTargets = me?.role === 'ADMIN' || (me?.role === 'FIELD' && me.id !== userId);
  const name = data?.employee.name ?? 'Employee';

  const monthOptions = fyMonths.map((m) => ({ value: m, label: monthLabel(m) }));
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
            key: 'remove',
            header: '',
            render: (t: EmployeeTargetFigureDto) => (
              <Button
                variant="ghost"
                size="sm"
                disabled={readOnly}
                aria-label={`Remove the ${t.product?.name ?? 'all products'} target`}
                onClick={() => setRemoving(t)}
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
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
            ? `${data.employee.employeeCode} · Targets, primary (Done orders to distributors) and secondary (what they sold, their achievement) for ${rangeLabel(data.fromMonth, data.toMonth)}.`
            : 'Targets, primary and secondary.'
        }
        actions={
          canSetTargets ? (
            <Button disabled={readOnly} onClick={() => setAdding(true)}>
              <Plus aria-hidden className="size-4" /> Set a target
            </Button>
          ) : undefined
        }
      />

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
                No target touches these months{canSetTargets ? '. Use “Set a target”.' : '.'}
              </p>
            )}
          </Card>
          <Card title="By product" description="Primary is valued as ordered (and Admin's change at PTS); secondary at PTR.">
            {data && data.products.length > 0 ? (
              <DataTable columns={productColumns} rows={data.products} rowKey={(p) => p.product.id} bleed={false} />
            ) : (
              <p className="px-5 py-6 text-[13px] text-text-muted">Nothing ordered or entered in these months yet.</p>
            )}
          </Card>
        </div>
      </DataState>

      <div className="mt-6">
        <Card
          title="Enter the month's figures"
          description={
            me?.role === 'ADMIN'
              ? 'Secondary is what they sold. Admin can also change the primary (a reason is needed).'
              : 'Secondary is what they sold in the month.'
          }
        >
          <div className="p-5">
            <EmployeeMonthGrid
              userId={userId}
              months={enterable.length > 0 ? enterable : [thisMonth]}
              month={month}
              onMonthChange={setMonth}
              canAdjust={me?.role === 'ADMIN'}
              isSelf={me?.id === userId}
            />
          </div>
        </Card>
      </div>

      {adding ? (
        <AddTargetDialog userId={userId} name={name} from={range.from} to={range.to} onClose={() => setAdding(false)} />
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
