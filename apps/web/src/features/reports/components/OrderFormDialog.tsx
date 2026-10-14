'use client';

import type { ReportOrderDetailDto } from '@greynote/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useChemists } from '@/features/field-master-data/hooks/useChemists';
import { useDistributors } from '@/features/field-master-data/hooks/useDistributors';
import { useActiveProducts } from '@/features/field-master-data/hooks/useProducts';
import { EmployeePickerField } from '@/features/people/components/EmployeePickerField';
import { istDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { paiseToRupees } from '@/lib/money';
import { useAddOrder, useEditOrder } from '../hooks/useOrders';
import {
  REMARKS_MAX,
  buildEdit,
  buildNewOrder,
  defaultPricePaise,
  emptyLine,
  emptyOrder,
  lineAmountPaise,
  linesOf,
  totalPaise,
  type OrderDraft,
} from '../lib/orderForm';

/** The lines table both forms share: product, quantity, price (₹), the amount that follows, and a way to add or drop a line. */
function LinesEditor({
  draft,
  setDraft,
  errors,
}: {
  draft: Pick<OrderDraft, 'outletType' | 'lines'>;
  setDraft: (change: (d: Pick<OrderDraft, 'outletType' | 'lines'>) => Pick<OrderDraft, 'outletType' | 'lines'>) => void;
  errors: Record<string, string>;
}) {
  const products = useActiveProducts();
  const options = (products.data ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.sku})` }));
  const setLine = (i: number, change: Partial<OrderDraft['lines'][number]>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l, at) => (at === i ? { ...l, ...change } : l)) }));
  const pick = (i: number, productId: string) => {
    const product = (products.data ?? []).find((p) => p.id === productId);
    const price = product ? defaultPricePaise(draft.outletType, product) : null;
    setLine(i, { productId, ...(price !== null && { price: paiseToRupees(price) }) });
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text">Products</p>
      {errors['lines'] ? <p role="alert" className="text-[13px] text-danger-fg">{errors['lines']}</p> : null}
      {draft.lines.map((l, i) => (
        <div key={i} className="space-y-1">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_6rem_auto] items-center gap-2">
            <Select aria-label={`Product ${i + 1}`} value={l.productId} onValueChange={(v) => pick(i, v)} options={options} placeholder="Product" />
            <Input aria-label={`Quantity ${i + 1}`} inputMode="numeric" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className="text-right tabular-nums" />
            <Input aria-label={`Price ${i + 1} (₹)`} inputMode="decimal" placeholder="₹ each" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} className="text-right tabular-nums" />
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove line ${i + 1}`}
              disabled={draft.lines.length === 1}
              onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((_, at) => at !== i) }))}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </div>
          <div className="flex justify-between text-xs text-text-subtle">
            <span role={errors[`line${i}`] ? 'alert' : undefined} className={errors[`line${i}`] ? 'text-danger-fg' : undefined}>{errors[`line${i}`] ?? ''}</span>
            <span className="tabular-nums">{lineAmountPaise(l) === null ? '' : formatMoney(lineAmountPaise(l) ?? 0)}</span>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, emptyLine()] }))}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> Add a product
        </Button>
        <p className="text-sm font-medium tabular-nums">Total {formatMoney(totalPaise(draft.lines))}</p>
      </div>
    </div>
  );
}

/** A distributor or a chemist: the active ones, searched by name. One outlet per order. */
function OutletField({ type, value, onChange, error }: { type: OrderDraft['outletType']; value: string; onChange: (id: string) => void; error?: string | undefined }) {
  const [term, setTerm] = useState('');
  const query = { page: 1, pageSize: 20, status: 'active' as const, ...(term.trim() && { search: term.trim() }) };
  const distributors = useDistributors(type === 'DISTRIBUTOR' ? query : undefined);
  const chemists = useChemists(type === 'CHEMIST' ? query : undefined);
  const rows = (type === 'DISTRIBUTOR' ? distributors.data?.items : chemists.data?.items) ?? [];
  return (
    <FormField label={type === 'DISTRIBUTOR' ? 'Distributor' : 'Chemist'} htmlFor="order-outlet" error={error}>
      <div className="space-y-2">
        <Input aria-label="Search by name" placeholder="Search by name" value={term} onChange={(e) => setTerm(e.target.value)} />
        <Select id="order-outlet" value={value} onValueChange={onChange} options={rows.map((r) => ({ value: r.id, label: r.name }))} placeholder={type === 'DISTRIBUTOR' ? 'Choose a distributor' : 'Choose a chemist'} aria-invalid={error ? true : undefined} />
      </div>
    </FormField>
  );
}

/** Admin or the Accountant adds an order for a field employee: who it is credited to, one distributor or one chemist, and the lines. */
export function AddOrderDialog({ onClose }: { onClose: () => void }) {
  const today = istDate();
  const [draft, setDraft] = useState<OrderDraft>(emptyOrder(today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const add = useAddOrder(onClose);
  const set = <K extends keyof OrderDraft>(field: K, value: OrderDraft[K]) => setDraft((d) => ({ ...d, [field]: value }));

  function submit() {
    const built = buildNewOrder(draft, today);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    add.mutate(built.body);
  }

  return (
    <FormDialog title="Add an order" description="Credited to the employee you choose. A distributor order counts as primary once it is marked Done." formId="add-order-form" pending={add.isPending} onClose={onClose} onSubmit={submit} wide>
      <EmployeePickerField id="order-employee" label="Employee" title="Choose the employee" value={draft.userId} onChange={(v) => set('userId', v)} error={errors['userId']} />
      <FormField label="Order for" htmlFor="order-type">
        <Select
          id="order-type"
          value={draft.outletType}
          onValueChange={(v) => setDraft((d) => ({ ...d, outletType: v as OrderDraft['outletType'], outletId: '' }))}
          options={[{ value: 'DISTRIBUTOR', label: 'A distributor' }, { value: 'CHEMIST', label: 'A chemist (information only)' }]}
        />
      </FormField>
      <OutletField type={draft.outletType} value={draft.outletId} onChange={(v) => set('outletId', v)} error={errors['outletId']} />
      <FormField label="Order date" htmlFor="order-date" error={errors['orderDate']}>
        <Input id="order-date" type="date" max={today} value={draft.orderDate} onChange={(e) => set('orderDate', e.target.value)} aria-invalid={errors['orderDate'] ? true : undefined} />
      </FormField>
      <LinesEditor draft={draft} setDraft={(change) => setDraft((d) => ({ ...d, ...change(d) }))} errors={errors} />
      <FormField label="Remarks (optional)" htmlFor="order-remarks" error={errors['remarks']}>
        <Textarea id="order-remarks" value={draft.remarks} maxLength={REMARKS_MAX} onChange={(e) => set('remarks', e.target.value)} />
      </FormField>
    </FormDialog>
  );
}

/** Admin or the Accountant corrects a placed order's lines, prices and remarks before marking it done. Employee, outlet and date stay. */
export function EditOrderDialog({ order, onClose }: { order: ReportOrderDetailDto; onClose: () => void }) {
  const [draft, setDraft] = useState<Pick<OrderDraft, 'outletType' | 'remarks' | 'lines'>>({ outletType: order.outletType, remarks: order.remarks ?? '', lines: linesOf(order.items) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const edit = useEditOrder(order.id, onClose);

  function submit() {
    const built = buildEdit(draft);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    edit.mutate(built.body);
  }

  return (
    <FormDialog title="Change the order" description={`${order.outlet.name} · placed by ${order.mr.name}. Employee, outlet and date stay as they are.`} formId="edit-order-form" pending={edit.isPending} onClose={onClose} onSubmit={submit} wide>
      <LinesEditor draft={draft} setDraft={(change) => setDraft((d) => ({ ...d, ...change(d) }))} errors={errors} />
      <FormField label="Remarks (optional)" htmlFor="edit-order-remarks" error={errors['remarks']}>
        <Textarea id="edit-order-remarks" value={draft.remarks} maxLength={REMARKS_MAX} onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))} />
      </FormField>
    </FormDialog>
  );
}
