'use client';

import type { EmployeeSalesLineDto } from '@greynote/contracts';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useEmployeeMonth, useSavePrimary, useSaveSecondary, useSubmitSecondary } from '../hooks/useEmployeeSales';
import {
  adjustmentOf,
  amountFromUnits,
  buildPrimary,
  buildSecondary,
  canSend,
  draftOf,
  isDirty,
  isLocked,
  rowErrors,
  SECONDARY_LABEL,
  SECONDARY_TONE,
  unitsFromAmount,
  type MonthDraft,
} from '../lib/employeeSales';

/**
 * One month, product by product: the employee's Done distributor orders (primary), the secondary they sold — typed by the employee, or for them
 * by their manager or Admin — and, for Admin only, a change to the primary with its reason. The secondary is the achievement. Nothing here
 * touches a distributor's stock. Units and amount are one figure at the product's PTR: typing either fills the other. The employee's own
 * entry is a draft until they send the month to their manager; only approved secondary counts toward achievement.
 */
export function EmployeeMonthGrid({
  userId,
  months,
  month,
  onMonthChange,
  canAdjust,
  isSelf,
}: {
  userId: string;
  months: readonly string[];
  month: string;
  onMonthChange: (month: string) => void;
  canAdjust: boolean;
  /** The grid is the signed-in employee's own month: their entry is a draft they send for approval. */
  isSelf: boolean;
}) {
  const query = useEmployeeMonth(userId, month);
  const readOnly = useIsReadOnly();
  const lines = useMemo(() => query.data?.lines ?? [], [query.data]);
  const [drafts, setDrafts] = useState<Map<string, MonthDraft>>(new Map());
  const [shown, setShown] = useState(false);
  const [amounts, setAmounts] = useState<Map<string, string>>(new Map());
  const saveSecondary = useSaveSecondary(() => setShown(false));
  const savePrimary = useSavePrimary(() => setShown(false));
  const send = useSubmitSecondary(() => setShown(false));

  // A fresh read (another month, or after a save) starts every row from what the server has.
  useEffect(() => {
    setDrafts(new Map(lines.map((l) => [l.product.id, draftOf(l)])));
    setAmounts(new Map());
  }, [lines]);

  const draftFor = (l: EmployeeSalesLineDto): MonthDraft => drafts.get(l.product.id) ?? draftOf(l);
  const edit = (l: EmployeeSalesLineDto, patch: Partial<MonthDraft>) =>
    setDrafts((m) => new Map(m).set(l.product.id, { ...draftFor(l), ...patch }));
  const errors = new Map(lines.map((l) => [l.product.id, rowErrors(l, draftFor(l), canAdjust)]));
  const hasErrors = [...errors.values()].some((e) => Object.keys(e).length > 0);
  const dirty = lines.some((l) => isDirty(l, draftFor(l), canAdjust));
  const pending = saveSecondary.isPending || savePrimary.isPending || send.isPending;
  const status = query.data?.secondaryStatus ?? null;

  function submit() {
    setShown(true);
    if (hasErrors) return;
    const secondary = buildSecondary(userId, month, lines, drafts);
    const primary = canAdjust ? buildPrimary(userId, month, lines, drafts) : null;
    if (secondary) saveSecondary.mutate(secondary);
    if (primary) savePrimary.mutate(primary);
  }

  const units = (l: EmployeeSalesLineDto, value: string) => {
    setAmounts((m) => {
      const next = new Map(m);
      next.delete(l.product.id);
      return next;
    });
    edit(l, { secondary: value });
  };
  const amount = (l: EmployeeSalesLineDto, value: string) => {
    setAmounts((m) => new Map(m).set(l.product.id, value));
    edit(l, { secondary: unitsFromAmount(l, value) });
  };

  const field = (l: EmployeeSalesLineDto, key: keyof MonthDraft, label: string, wide = false) => (
    <Input
      aria-label={`${label}, ${l.product.name}`}
      value={draftFor(l)[key]}
      inputMode={key === 'reason' ? 'text' : 'numeric'}
      disabled={readOnly}
      onChange={(e) => edit(l, { [key]: e.target.value })}
      aria-invalid={shown && errors.get(l.product.id)?.[key] ? true : undefined}
      title={shown ? errors.get(l.product.id)?.[key] : undefined}
      className={wide ? 'h-9 w-44' : 'h-9 w-24 text-right tabular-nums'}
    />
  );

  const columns: readonly Column<EmployeeSalesLineDto>[] = [
    { key: 'product', header: 'Product', render: (l) => <span className="font-medium">{l.product.name}</span> },
    { key: 'orders', header: 'From orders', numeric: true, render: (l) => l.orderPrimaryQty },
    {
      key: 'primary',
      header: canAdjust ? 'Primary (editable)' : 'Primary',
      numeric: true,
      render: (l) => (canAdjust ? field(l, 'primary', 'Primary total') : l.primaryQty),
    },
    ...(canAdjust
      ? [
          {
            key: 'reason',
            header: 'Why changed',
            render: (l: EmployeeSalesLineDto) =>
              adjustmentOf(l, draftFor(l)) !== 0 ? (
                field(l, 'reason', 'Reason', true)
              ) : (
                <span className="text-text-subtle">—</span>
              ),
          } satisfies Column<EmployeeSalesLineDto>,
        ]
      : []),
    {
      key: 'secondary',
      header: 'Secondary (units)',
      numeric: true,
      render: (l) => (
        <Input
          aria-label={`Secondary, ${l.product.name}`}
          value={draftFor(l).secondary}
          inputMode="numeric"
          disabled={readOnly || isLocked(l, isSelf)}
          onChange={(e) => units(l, e.target.value)}
          aria-invalid={shown && errors.get(l.product.id)?.secondary ? true : undefined}
          title={shown ? errors.get(l.product.id)?.secondary : undefined}
          className="h-9 w-24 text-right tabular-nums"
        />
      ),
    },
    {
      key: 'amount',
      header: 'Secondary (₹ at PTR)',
      numeric: true,
      render: (l) =>
        l.ptrPaise ? (
          <Input
            aria-label={`Secondary amount, ${l.product.name}`}
            value={amounts.get(l.product.id) ?? amountFromUnits(l, draftFor(l).secondary)}
            inputMode="decimal"
            disabled={readOnly || isLocked(l, isSelf)}
            onChange={(e) => amount(l, e.target.value)}
            className="h-9 w-28 text-right tabular-nums"
          />
        ) : (
          <span className="text-xs text-text-subtle" title="This product has no PTR set">units only</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (l) => (l.secondaryStatus ? <Badge tone={SECONDARY_TONE[l.secondaryStatus]}>{SECONDARY_LABEL[l.secondaryStatus]}</Badge> : <span className="text-text-subtle">—</span>),
    },
    {
      key: 'by',
      header: 'Last change',
      render: (l) =>
        l.updatedBy && l.updatedAt ? (
          <span className="text-xs text-text-muted">
            {l.updatedBy.name}, {l.updatedAt.slice(0, 10)}
          </span>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-56">
          <Select
            aria-label="Month"
            value={month}
            onValueChange={onMonthChange}
            options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
          />
        </div>
        <div className="flex items-center gap-2">
          {status ? <Badge tone={SECONDARY_TONE[status]}>{SECONDARY_LABEL[status]}</Badge> : null}
          <Button disabled={readOnly || !dirty || pending} onClick={submit}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          {isSelf ? (
            <Button variant="secondary" disabled={readOnly || pending || !canSend(status, dirty)} onClick={() => send.mutate({ month })}>
              Send for approval
            </Button>
          ) : null}
        </div>
      </div>
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={lines.length === 0}
        empty={{ title: 'No active products', description: 'Add products first.' }}
      >
        <DataTable columns={columns} rows={lines} rowKey={(l) => l.product.id} bleed={false} />
      </DataState>
    </div>
  );
}
