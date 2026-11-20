'use client';

import type { EmployeeTargetFigureDto } from '@greynote/contracts';
import { ChevronRight, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { Input } from '@/components/ui/Input';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { toErrorState } from '@/lib/api/toErrorState';
import { useSession } from '@/lib/auth/SessionProvider';
import { istDate } from '@/lib/dates';
import { financialYearLabel, financialYearOf } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { useDeleteTarget, useEmployeeSalesReport } from '../hooks/useEmployeeSales';
import { rangeLabel } from '../lib/employeeSales';
import { financialYearMonths } from '../lib/salesDashboard';
import { buildMatrix, filterRows, type MatrixRow } from '../lib/targetTable';
import { EditTargetDialog } from './EditTargetDialog';
import { SetTargetDialog, type SplitPreset } from './SetTargetDialog';

const money = (paise: number): string => formatMoney(paise);
const SHORT_MONTH = (m: string): string => monthLabel(m).replace(/\s\d{4}$/, '');
const unitsText = (qty: number | null): string => (qty === null ? '' : ` · ${qty.toLocaleString('en-IN')} units`);

/**
 * An employee's targets for the financial year as one table (decision-log 2026-11-20): products down the side, the year's months across, each
 * cell the sum of every target covering that month, so targets that overlap are visibly added up. Behind each product's name are its months,
 * its units, and Edit and Remove; a product with several targets opens them one per line. The totals are the first row, so they show without
 * scrolling. Old all-products targets (set before targets were per product) have a row of their own with a button to split each across products.
 * Only an MR holds targets: a manager's table is their MRs' total, to look at.
 */
export function EmployeeTargetsPanel({ userId, name }: { userId: string; name: string }) {
  const { user: me } = useSession();
  const { year } = useFinancialYear();
  const readOnly = useIsReadOnly();
  const today = istDate();
  const thisMonth = today.slice(0, 7);
  const fy = year ?? financialYearOf(today);
  const months = useMemo(() => financialYearMonths(fy), [fy]);
  const query = useEmployeeSalesReport({ userId, from: months[0] ?? thisMonth, to: months[11] ?? thisMonth }, months.length === 12);
  const data = query.data;
  const isManager = Boolean(data?.team);
  // Only Admin and HR set targets, and only on an MR (the API refuses a manager), and not in a past year; shown once the report has loaded.
  const canSet = Boolean(data) && !isManager && (me?.role === 'ADMIN' || me?.role === 'HR');

  const [setting, setSetting] = useState(false);
  const [splitting, setSplitting] = useState<SplitPreset | null>(null);
  const [editing, setEditing] = useState<EmployeeTargetFigureDto | null>(null);
  const [removing, setRemoving] = useState<EmployeeTargetFigureDto | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const remove = useDeleteTarget(() => setRemoving(null));

  const targets = useMemo(() => data?.targets ?? [], [data]);
  const matrix = useMemo(() => buildMatrix(targets, months), [targets, months]);
  const byId = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);
  const rows = useMemo(() => filterRows(matrix.rows, search), [matrix.rows, search]);
  const productCount = matrix.rows.filter((r) => !r.old).length;
  const shownCount = rows.filter((r) => !r.old).length;
  const label = financialYearLabel(fy);
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const actions = (id: string, what: string) => {
    const t = byId.get(id);
    return canSet && t ? (
      <span className="ml-auto flex shrink-0 gap-0.5">
        <Button variant="ghost" size="sm" disabled={readOnly} aria-label={`Edit ${what}`} title="Edit" onClick={() => setEditing(t)}>
          <Pencil aria-hidden className="size-3.5" />
        </Button>
        <Button variant="ghost" size="sm" disabled={readOnly} aria-label={`Remove ${what}`} title="Remove" onClick={() => setRemoving(t)}>
          <Trash2 aria-hidden className="size-3.5" />
        </Button>
      </span>
    ) : null;
  };

  const cells = (values: readonly number[], className = '') =>
    months.map((m, i) => (
      <td key={m} className={`border-b border-border px-3 py-2 text-right tabular-nums ${m === thisMonth ? 'bg-accent-soft/40' : ''} ${values[i] === 0 ? 'text-text-subtle' : ''} ${className}`}>
        {values[i] === 0 ? '·' : money(values[i]!)}
      </td>
    ));

  const nameCell = 'sticky left-0 z-10 min-w-60 max-w-72 border-b border-r border-border bg-surface px-3 py-2 text-left align-top font-normal';

  const productRow = (r: MatrixRow) => {
    const many = r.targets.length > 1;
    const isOpen = open.has(r.key);
    const only = r.targets[0]!.line;
    return (
      <Fragment key={r.key}>
        <tr>
          <th scope="row" className={nameCell}>
            <div className="flex items-start gap-1">
              {many ? (
                <button type="button" className="mt-0.5 rounded p-0.5 text-text-muted hover:bg-surface-hover" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} the ${r.targets.length} ${r.name} targets`} onClick={() => toggle(r.key)}>
                  <ChevronRight aria-hidden className={`size-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </button>
              ) : null}
              <div className="min-w-0">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-[12px] font-normal text-text-muted">{many ? `${r.targets.length} targets, added up` : `${rangeLabel(only.fromMonth, only.toMonth)}${unitsText(only.targetQty)}`}</div>
              </div>
              {many ? null : actions(only.id, `the ${r.name} target`)}
            </div>
          </th>
          {cells(r.months)}
          <td className="border-b border-l border-border px-3 py-2 text-right font-medium tabular-nums">{money(r.total)}</td>
        </tr>
        {many && isOpen
          ? r.targets.map((t) => (
              <tr key={t.line.id} className="bg-surface-subtle/60">
                <th scope="row" className={`${nameCell} bg-surface-subtle pl-9`}>
                  <div className="flex items-start gap-1">
                    <div className="min-w-0 text-[13px]">
                      {rangeLabel(t.line.fromMonth, t.line.toMonth)}
                      <span className="text-text-muted">{unitsText(t.line.targetQty)}</span>
                    </div>
                    {actions(t.line.id, `the ${r.name} target for ${rangeLabel(t.line.fromMonth, t.line.toMonth)}`)}
                  </div>
                </th>
                {cells(t.months, 'text-[12px]')}
                <td className="border-b border-l border-border px-3 py-2 text-right text-[12px] tabular-nums">{money(t.line.amountPaise)}</td>
              </tr>
            ))
          : null}
      </Fragment>
    );
  };

  const oldRow = (r: MatrixRow) => (
    <tr key={r.key} className="bg-warning-bg/40">
      <th scope="row" className={`${nameCell} bg-warning-bg`}>
        <div className="font-medium">All products, not split by product</div>
        <div className="text-[12px] font-normal text-text-muted">Old targets. Split each across products so the reports show it by product.</div>
        <ul className="mt-1.5 space-y-1">
          {r.targets.map((t) => (
            <li key={t.line.id} className="flex flex-wrap items-center gap-2 text-[12px] font-normal">
              <span className="tabular-nums">
                {rangeLabel(t.line.fromMonth, t.line.toMonth)}: {money(t.line.amountPaise)}
              </span>
              {canSet ? (
                <>
                  <Button size="sm" disabled={readOnly} onClick={() => setSplitting({ targetId: t.line.id, fromMonth: t.line.fromMonth, toMonth: t.line.toMonth, totalPaise: t.line.amountPaise })}>
                    Split by product
                  </Button>
                  {actions(t.line.id, 'this old target')}
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </th>
      {cells(r.months)}
      <td className="border-b border-l border-border px-3 py-2 text-right font-medium tabular-nums">{money(r.total)}</td>
    </tr>
  );

  return (
    <>
      <Card
        title={`Targets · ${label}`}
        description="Each target is spread evenly over the months it covers. Targets that overlap add up."
        actions={
          canSet ? (
            <Button disabled={readOnly} onClick={() => setSetting(true)}>
              <Plus aria-hidden className="size-4" /> Set target
            </Button>
          ) : null
        }
      >
        <DataState
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={false}
          empty={{ title: '', description: '' }}
        >
          <div className="space-y-4 px-5 pb-5">
            {isManager ? (
              <p className="rounded-md bg-surface-subtle px-3 py-2 text-[13px] text-text-muted">
                Targets are set on each MR. This is the total of the {data?.team?.mrCount ?? 0} MRs in their team, to look at.
              </p>
            ) : null}

            {targets.length === 0 ? (
              <p className="py-4 text-[13px] text-text-muted">
                {isManager && data?.team?.mrCount === 0
                  ? 'No MRs under them yet, so there is nothing to add up.'
                  : `No target for ${label} yet${canSet ? '. Use “Set target”.' : '.'}`}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm">
                    <span className="text-text-muted">In all for the year: </span>
                    <span className="font-semibold tabular-nums">{money(matrix.total)}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="relative w-64">
                      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
                      <Input aria-label="Find a product" placeholder="Find a product…" className="pl-9 pr-9" value={search} onChange={(e) => setSearch(e.target.value)} />
                      {search ? (
                        <button type="button" aria-label="Clear the search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:bg-surface-hover" onClick={() => setSearch('')}>
                          <X aria-hidden className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                    {search ? (
                      <span className="text-[12px] text-text-muted" role="status">
                        {shownCount} of {productCount}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="min-w-full border-separate border-spacing-0 text-[13px]">
                    <thead>
                      <tr>
                        <th scope="col" className="sticky left-0 z-20 min-w-60 border-b border-r border-border bg-surface-subtle px-3 py-2 text-left font-medium">
                          Product
                        </th>
                        {months.map((m) => (
                          <th key={m} scope="col" className={`min-w-24 border-b border-border px-3 py-2 text-right font-medium ${m === thisMonth ? 'bg-accent-soft text-accent' : 'bg-surface-subtle'}`}>
                            {SHORT_MONTH(m)}
                          </th>
                        ))}
                        <th scope="col" className="min-w-28 border-b border-l border-border bg-surface-subtle px-3 py-2 text-right font-medium">
                          Year
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="font-semibold">
                        <th scope="row" className={`${nameCell} bg-surface-subtle font-semibold`}>
                          All products
                        </th>
                        {cells(matrix.monthTotals, 'bg-surface-subtle')}
                        <td className="border-b border-l border-border bg-surface-subtle px-3 py-2 text-right tabular-nums">{money(matrix.total)}</td>
                      </tr>
                      {rows.filter((r) => r.old).map(oldRow)}
                      {rows.filter((r) => !r.old).map(productRow)}
                      {shownCount === 0 && search ? (
                        <tr>
                          <td colSpan={months.length + 2} className="px-3 py-6 text-center text-text-muted">
                            No product matches “{search}”.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </DataState>
      </Card>

      {setting ? <SetTargetDialog userId={userId} name={name} onClose={() => setSetting(false)} /> : null}
      {splitting ? <SetTargetDialog userId={userId} name={name} preset={splitting} onClose={() => setSplitting(null)} /> : null}
      {editing ? <EditTargetDialog key={editing.id} name={name} target={editing} onClose={() => setEditing(null)} /> : null}
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
