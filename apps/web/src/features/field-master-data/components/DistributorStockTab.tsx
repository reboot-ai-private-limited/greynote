'use client';

import type { StatementLineDto } from '@greynote/contracts';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { financialYearMonths } from '@/features/reports/lib/salesDashboard';
import { toErrorState } from '@/lib/api/toErrorState';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { useDistributorStatement, useSaveStatement } from '../hooks/useDistributorStatement';
import {
  FLAG_LABEL,
  buildSave,
  draftOf,
  isDirty,
  liveFigures,
  rowErrors,
  copyFieldCount,
  type StockDraft,
} from '../lib/stock';

const num = (n: number | null): string => (n === null ? '—' : String(n));

/**
 * One distributor's month, product by product (decision-log 2026-10-09): what the field workers counted, what the orders came to, and Admin's
 * statement — opening, the secondary the distributor reported, and an adjustment to primary with its reason. Closing follows:
 * Opening + Primary − Secondary. A saved statement is the figure the reports use; the field count then only shows a difference.
 */
export function DistributorStockTab({
  distributorId,
  inactive,
}: {
  distributorId: string;
  inactive: boolean;
}) {
  const today = istDate();
  const { year } = useFinancialYear();
  const months = useMemo(
    () => financialYearMonths(year ?? financialYearOf(today)).filter((m) => m <= today.slice(0, 7)),
    [year, today],
  );
  const [month, setMonth] = useState(
    months.includes(today.slice(0, 7))
      ? today.slice(0, 7)
      : (months[months.length - 1] ?? today.slice(0, 7)),
  );
  const query = useDistributorStatement(distributorId, month);
  const readOnly = useIsReadOnly();
  const lines = useMemo(() => query.data?.lines ?? [], [query.data]);
  const [drafts, setDrafts] = useState<Map<string, StockDraft>>(new Map());
  const [shown, setShown] = useState(false);
  const save = useSaveStatement(() => setShown(false));
  const locked = readOnly || inactive;

  // A fresh read (another month, or after a save) starts every row from what the server has.
  useEffect(() => {
    setDrafts(new Map(lines.map((l) => [l.product.id, draftOf(l)])));
  }, [lines]);

  const draftFor = (l: StatementLineDto): StockDraft => drafts.get(l.product.id) ?? draftOf(l);
  const edit = (l: StatementLineDto, patch: Partial<StockDraft>) =>
    setDrafts((m) => new Map(m).set(l.product.id, { ...draftFor(l), ...patch }));
  const dirty = lines.some((l) => isDirty(l, draftFor(l)));
  const errors = new Map(lines.map((l) => [l.product.id, rowErrors(l, draftFor(l))]));
  const hasErrors = [...errors.values()].some((e) => Object.keys(e).length > 0);
  const counted = lines.filter((l) => l.count);

  function submit() {
    setShown(true);
    if (hasErrors) return;
    const body = buildSave(distributorId, month, lines, drafts);
    if (body) save.mutate(body);
  }

  const cell = (l: StatementLineDto, field: keyof StockDraft, label: string, narrow = true) => (
    <Input
      aria-label={`${label}, ${l.product.name}`}
      value={draftFor(l)[field]}
      inputMode={field === 'reason' ? 'text' : 'numeric'}
      disabled={locked}
      onChange={(e) => edit(l, { [field]: e.target.value })}
      aria-invalid={shown && errors.get(l.product.id)?.[field] ? true : undefined}
      title={shown ? errors.get(l.product.id)?.[field] : undefined}
      className={narrow ? 'h-9 w-24 text-right tabular-nums' : 'h-9 w-48'}
    />
  );

  const columns: readonly Column<StatementLineDto>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (l) => <span className="font-medium">{l.product.name}</span>,
    },
    {
      key: 'count',
      header: 'Field count',
      render: (l) =>
        l.count ? (
          <div className="flex items-center gap-2">
            <span className="tabular-nums" title={`${l.count.by.name}, ${l.count.at.slice(0, 10)}`}>
              {l.count.openingQty} → {l.count.closingQty}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={locked}
              onClick={() => edit(l, copyFieldCount(l, draftFor(l)))}
            >
              Use
            </Button>
          </div>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
    {
      key: 'opening',
      header: 'Opening',
      numeric: true,
      render: (l) => cell(l, 'opening', 'Opening'),
    },
    { key: 'orders', header: 'From orders', numeric: true, render: (l) => l.orderPrimaryQty },
    {
      key: 'adjustment',
      header: 'Adjustment',
      numeric: true,
      render: (l) => cell(l, 'adjustment', 'Adjustment'),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (l) =>
        (draftFor(l).adjustment.trim() !== '' && draftFor(l).adjustment.trim() !== '0') ||
        draftFor(l).reason !== '' ? (
          cell(l, 'reason', 'Reason', false)
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
    {
      key: 'primary',
      header: 'Primary',
      numeric: true,
      render: (l) => <span className="font-medium">{liveFigures(l, draftFor(l)).primary}</span>,
    },
    {
      key: 'secondary',
      header: 'Secondary',
      numeric: true,
      render: (l) => cell(l, 'secondary', 'Secondary'),
    },
    {
      key: 'closing',
      header: 'Closing',
      numeric: true,
      render: (l) => {
        const f = liveFigures(l, draftFor(l));
        const shownSecondary =
          draftFor(l).secondary.trim() === '' && f.secondary !== null
            ? ` (secondary ${f.secondary})`
            : '';
        return (
          <span
            className={f.closing !== null && f.closing < 0 ? 'font-medium text-danger-fg' : ''}
            title={shownSecondary ? `Worked out from the field count${shownSecondary}` : undefined}
          >
            {num(f.closing)}
          </span>
        );
      },
    },
    {
      key: 'flags',
      header: '',
      render: (l) => (
        <div className="flex flex-wrap gap-1">
          {l.flags.map((f) => (
            <Badge
              key={f}
              tone={f === 'COUNT_MISMATCH' || f === 'OPENING_MISMATCH' ? 'warning' : 'danger'}
            >
              {FLAG_LABEL[f]}
            </Badge>
          ))}
          {shown && Object.values(errors.get(l.product.id) ?? {}).length > 0 ? (
            <Badge tone="danger">{Object.values(errors.get(l.product.id) ?? {})[0] ?? ''}</Badge>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-48" title={dirty ? 'Save or discard your changes first' : undefined}>
            <Select
              aria-label="Month"
              value={month}
              onValueChange={setMonth}
              options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
              disabled={dirty}
            />
          </div>
          <p className="text-sm text-text-muted">
            Opening + Primary − Secondary = Closing. A saved statement is what the reports use.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={locked || counted.length === 0}
            onClick={() =>
              setDrafts(
                (m) =>
                  new Map(
                    [...m].map(([id, d]) => [
                      id,
                      lines.find((l) => l.product.id === id)?.count
                        ? copyFieldCount(
                            lines.find((l) => l.product.id === id)!,
                            d,
                          )
                        : d,
                    ]),
                  ),
              )
            }
          >
            Use all field counts
          </Button>
          <Button
            variant="secondary"
            disabled={!dirty}
            onClick={() => {
              setDrafts(new Map(lines.map((l) => [l.product.id, draftOf(l)])));
              setShown(false);
            }}
          >
            Discard
          </Button>
          <Button
            disabled={locked || !dirty || save.isPending}
            title={
              readOnly
                ? 'A past financial year is read-only'
                : inactive
                  ? 'Reactivate the distributor first'
                  : undefined
            }
            onClick={submit}
          >
            {save.isPending ? 'Saving…' : 'Save statement'}
          </Button>
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
