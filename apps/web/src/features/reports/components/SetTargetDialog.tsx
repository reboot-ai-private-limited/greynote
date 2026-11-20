'use client';

import { Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useActiveProducts } from '@/features/field-master-data/hooks/useProducts';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { rupeesToPaise } from '@/lib/money';
import { useSetTargetsBulk, useSplitTarget } from '../hooks/useEmployeeSales';
import { financialYearMonths } from '../lib/salesDashboard';
import { FULL, maxFor, parsePercent, percentText, splitBody, splitItems, splitState } from '../lib/targetSplit';
import { rangeLabel } from '../lib/employeeSales';

/** An old all-products target being split: its months and total are fixed, only the percentages are chosen. */
export interface SplitPreset {
  targetId: string;
  fromMonth: string;
  toMonth: string;
  totalPaise: number;
}

type Mode = 'split' | 'products';
interface Line {
  id: number;
  productId: string;
  amount: string;
}

const pct = (bp: number): string => `${percentText(Math.abs(bp))} %`;

/**
 * Set targets for one MR (decision-log 2026-11-20): a target is always for a product. Two ways in:
 * - **Split a total**: the months, a total in rupees, and a percentage for each product that must come to exactly 100 % (Done stays off until
 *   it does; the box that pushes it past 100 % turns red). One target per product with a share is made.
 * - **By product**: pick the products and give each its amount.
 * With `preset` it splits an old all-products target, whose total and months stay as they were.
 */
export function SetTargetDialog({ userId, name, preset, onClose }: { userId: string; name: string; preset?: SplitPreset; onClose: () => void }) {
  const months = useMemo(() => financialYearMonths(financialYearOf(istDate())), []);
  const thisMonth = istDate().slice(0, 7);
  const [mode, setMode] = useState<Mode>('split');
  const [fromMonth, setFromMonth] = useState(preset?.fromMonth ?? (months.includes(thisMonth) ? thisMonth : (months[0] ?? thisMonth)));
  const [toMonth, setToMonth] = useState(preset?.toMonth ?? (months[months.length - 1] ?? thisMonth));
  const [total, setTotal] = useState(preset ? String(preset.totalPaise / 100) : '');
  const [boxes, setBoxes] = useState<Record<string, string>>({});
  const [lastEdited, setLastEdited] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [lines, setLines] = useState<Line[]>([{ id: 1, productId: '', amount: '' }]);
  const [nextId, setNextId] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const products = useActiveProducts();
  // Only products with a PTS can be priced into units and the Excel, so only they can take a target.
  const priced = useMemo(() => (products.data ?? []).filter((p) => p.ptsPaise).sort((a, b) => a.name.localeCompare(b.name)), [products.data]);
  const bulk = useSetTargetsBulk(onClose);
  const split = useSplitTarget(onClose);
  const pending = bulk.isPending || split.isPending;
  const monthOptions = months.map((m) => ({ value: m, label: monthLabel(m) }));
  const monthsBad = toMonth < fromMonth;
  const totalPaise = preset ? preset.totalPaise : rupeesToPaise(total);

  // The percentages, with a box for every priced product (blank = 0).
  const allBoxes = useMemo(() => Object.fromEntries(priced.map((p) => [p.id, boxes[p.id] ?? ''])), [priced, boxes]);
  const state = splitState(allBoxes, lastEdited);
  const shown = priced.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()) || (boxes[p.id] ?? '') !== '');

  const typePercent = (id: string, text: string) => {
    setBoxes((b) => ({ ...b, [id]: text }));
    setLastEdited(id);
  };

  const splitReady = state.complete && totalPaise !== null && totalPaise > 0 && !monthsBad;
  const chosen = lines.filter((l) => l.productId !== '');
  const lineAmounts = lines.map((l) => ({ line: l, paise: rupeesToPaise(l.amount) }));
  const productsError = (() => {
    if (monthsBad) return 'The last month cannot be before the first.';
    if (chosen.length === 0) return 'Choose at least one product.';
    if (new Set(chosen.map((l) => l.productId)).size !== chosen.length) return 'A product is listed twice.';
    if (lineAmounts.some(({ line, paise }) => line.productId !== '' && !paise)) return 'Give every product an amount in rupees, more than zero.';
    if (lineAmounts.some(({ line, paise }) => line.productId === '' && (line.amount.trim() !== '' || paise))) return 'Choose a product for every amount.';
    return null;
  })();

  function submit() {
    setError(null);
    if (mode === 'split') {
      if (!splitReady || totalPaise === null) return;
      if (preset) split.mutate({ id: preset.targetId, items: splitItems(totalPaise, allBoxes) });
      else bulk.mutate(splitBody(userId, { from: fromMonth, to: toMonth }, totalPaise, allBoxes));
      return;
    }
    if (productsError) {
      setError(productsError);
      return;
    }
    bulk.mutate({ userId, month: fromMonth, toMonth, items: chosen.map((l) => ({ productId: l.productId, targetAmountPaise: rupeesToPaise(l.amount)! })) });
  }

  const tab = (value: Mode, label: string) => (
    <Button type="button" variant={mode === value ? 'primary' : 'secondary'} size="sm" aria-pressed={mode === value} onClick={() => setMode(value)}>
      {label}
    </Button>
  );

  return (
    <FormDialog
      wide
      title={preset ? `Split an old target by product: ${name}` : `Set targets: ${name}`}
      description={
        preset
          ? `This target covers ${rangeLabel(preset.fromMonth, preset.toMonth)} for all products: ${formatMoney(preset.totalPaise)}. Share it across the products; it is replaced by one target per product and the total does not change.`
          : 'Targets are set per product, for a run of whole months of the current financial year. Each amount is spread evenly over its months, and targets that overlap add up.'
      }
      formId="set-target-form"
      pending={pending}
      disabled={mode === 'split' ? !splitReady : false}
      submitLabel="Done"
      onClose={onClose}
      onSubmit={submit}
    >
      {preset ? null : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="How to set the targets">
          {tab('split', 'Split a total by %')}
          {tab('products', 'By product')}
        </div>
      )}

      {preset ? null : (
        <div className="grid grid-cols-2 gap-4">
          <FormField label="From month" htmlFor="set-from">
            <Select id="set-from" value={fromMonth} onValueChange={(m) => { setFromMonth(m); if (toMonth < m) setToMonth(m); }} options={monthOptions} />
          </FormField>
          <FormField label="To month" htmlFor="set-to" error={monthsBad ? 'The last month cannot be before the first.' : undefined}>
            <Select id="set-to" value={toMonth} onValueChange={setToMonth} options={monthOptions} />
          </FormField>
        </div>
      )}

      {mode === 'split' ? (
        <>
          {preset ? null : (
            <FormField label="Total target (₹)" htmlFor="set-total" hint="The whole amount for these months, shared across the products below.">
              <Input id="set-total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
            </FormField>
          )}
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-subtle px-3 py-2 text-[13px]" role="status">
            <span className="font-medium tabular-nums">Allotted {pct(state.sum)}</span>
            {state.over ? (
              <span className="font-medium text-danger-fg">Over by {pct(state.overBy)}: lower a product</span>
            ) : state.complete ? (
              <span className="font-medium text-success-fg">100 % allotted</span>
            ) : (
              <span className="text-text-muted tabular-nums">{pct(state.remaining)} left to allot</span>
            )}
          </div>
          <Input aria-label="Find a product" placeholder="Find a product…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {products.isLoading ? <p className="text-[13px] text-text-muted">Loading products…</p> : null}
          <ul className="divide-y divide-border rounded-md border border-border">
            {shown.map((p) => {
              const text = boxes[p.id] ?? '';
              const bp = parsePercent(text);
              const blamed = state.blame === p.id;
              const bad = bp === null || blamed;
              const message = bp === null ? 'Use a number up to two decimals, like 12.5.' : blamed ? `Too much: the most for this product is ${pct(maxFor(allBoxes, p.id))}.` : null;
              return (
                <li key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-3 py-2">
                  <span className="text-sm">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="w-28 text-right text-[12px] tabular-nums text-text-muted">{bp && totalPaise ? formatMoney(Math.round((totalPaise * bp) / FULL)) : ''}</span>
                    <Input
                      aria-label={`${p.name} percentage`}
                      aria-invalid={bad ? true : undefined}
                      inputMode="decimal"
                      className="w-24 text-right"
                      placeholder="0"
                      value={text}
                      onChange={(e) => typePercent(p.id, e.target.value)}
                    />
                    <span className="text-sm text-text-muted">%</span>
                  </div>
                  {message ? (
                    <p role="alert" className="col-span-2 mt-1 text-right text-[13px] text-danger-fg">
                      {message}
                    </p>
                  ) : null}
                </li>
              );
            })}
            {shown.length === 0 && !products.isLoading ? <li className="px-3 py-4 text-[13px] text-text-muted">No product matches.</li> : null}
          </ul>
          {priced.length !== (products.data ?? []).length ? <p className="text-[12px] text-text-muted">Products without a PTS are not listed: they cannot be priced into a target.</p> : null}
        </>
      ) : (
        <>
          <ul className="space-y-3">
            {lines.map((l) => (
              <li key={l.id} className="grid grid-cols-[1fr_9rem_auto] items-end gap-2">
                <FormField label="Product" htmlFor={`line-product-${l.id}`}>
                  <SearchableSelect
                    id={`line-product-${l.id}`}
                    value={l.productId}
                    onValueChange={(id) => setLines((all) => all.map((x) => (x.id === l.id ? { ...x, productId: id } : x)))}
                    options={priced.filter((p) => p.id === l.productId || !lines.some((x) => x.productId === p.id)).map((p) => ({ value: p.id, label: p.name }))}
                    placeholder="Choose a product…"
                  />
                </FormField>
                <FormField label="Target (₹)" htmlFor={`line-amount-${l.id}`}>
                  <Input id={`line-amount-${l.id}`} inputMode="decimal" value={l.amount} onChange={(e) => setLines((all) => all.map((x) => (x.id === l.id ? { ...x, amount: e.target.value } : x)))} />
                </FormField>
                <Button type="button" variant="ghost" size="sm" aria-label="Remove this product" disabled={lines.length === 1} onClick={() => setLines((all) => all.filter((x) => x.id !== l.id))}>
                  <X aria-hidden className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setLines((all) => [...all, { id: nextId, productId: '', amount: '' }]);
              setNextId((n) => n + 1);
            }}
          >
            <Plus aria-hidden className="size-4" /> Add a product
          </Button>
          {error ? <p role="alert" className="text-[13px] text-danger-fg">{error}</p> : null}
        </>
      )}
    </FormDialog>
  );
}
