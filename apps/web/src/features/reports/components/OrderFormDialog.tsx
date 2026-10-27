'use client';

import type { ReportOrderDetailDto } from '@greynote/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

const DISC_OPTIONS = [
  { value: 'NONE', label: 'No discount' },
  { value: 'PERCENT', label: 'Percentage (%) discount' },
  { value: 'FIXED', label: 'Rupees (₹) discount' },
];

/** A discount picker: none, a percentage, or a flat rupee amount, with the number beside it. */
function DiscountInput({ label, kind, value, onChange }: { label: string; kind: DiscKind; value: string; onChange: (change: { discKind: DiscKind; discValue: string }) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label={`${label} type`}
        value={kind === '' ? 'NONE' : kind}
        onValueChange={(v) =>
          onChange({
            discKind: v === 'NONE' ? '' : (v as DiscKind),
            discValue: v === 'NONE' ? '' : value,
          })
        }
        options={DISC_OPTIONS}
      />
      {kind !== '' ? (
        <Input
          aria-label={label}
          inputMode="decimal"
          placeholder={kind === 'PERCENT' ? '%' : '₹'}
          value={value}
          onChange={(e) => onChange({ discKind: kind, discValue: e.target.value })}
          className="w-24 text-right tabular-nums"
        />
      ) : null}
    </div>
  );
}
import { useChemists } from '@/features/field-master-data/hooks/useChemists';
import { useDistributors } from '@/features/field-master-data/hooks/useDistributors';
import { useActiveProducts } from '@/features/field-master-data/hooks/useProducts';
import { EmployeePickerField } from '@/features/people/components/EmployeePickerField';
import { istDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { paiseToRupees } from '@/lib/money';
import { useAddOrder, useCompleteOrder, useEditOrder, useOrderDetail, useSetInvoiceNumber } from '../hooks/useOrders';
import {
  REMARKS_MAX,
  buildEdit,
  buildNewOrder,
  buildSupply,
  INVOICE_NUMBER_MAX,
  deliveredPaise,
  notSupplied,
  supplyDraftOf,
  type SupplyDraft,
  defaultPricePaise,
  emptyLine,
  emptyOrder,
  lineAmountPaise,
  linesOf,
  discDraftOf,
  previewNet,
  type DiscKind,
  type OrderDraft,
} from '../lib/orderForm';

/** Under a line of a changed order: what the employee originally ordered, in a warning colour where the line now differs. */
function OriginalNote({ line, original }: { line: OrderDraft['lines'][number]; original: { quantity: number; unitPricePaise: number } | undefined }) {
  if (!original) return <span className="text-warning-fg">Added by the office; not in the original order</span>;
  const changed = String(original.quantity) !== line.quantity.trim() || paiseToRupees(original.unitPricePaise) !== paiseToRupees(Math.round(Number(line.price || 0) * 100));
  return (
    <span className={changed ? 'text-warning-fg' : undefined}>
      Originally ordered: {original.quantity} × {formatMoney(original.unitPricePaise)}
    </span>
  );
}

/** The lines table both forms share: product, quantity, price (₹), the amount that follows, and a way to add or drop a line. */
function LinesEditor({
  draft,
  setDraft,
  errors,
  originals,
}: {
  draft: Pick<OrderDraft, 'outletType' | 'lines' | 'discKind' | 'discValue'>;
  setDraft: (change: (d: Pick<OrderDraft, 'outletType' | 'lines' | 'discKind' | 'discValue'>) => Pick<OrderDraft, 'outletType' | 'lines' | 'discKind' | 'discValue'>) => void;
  errors: Record<string, string>;
  /** What the employee originally ordered, per product, when changing an existing order: shown under each line so a change is seen against it. */
  originals?: ReadonlyMap<string, { productName: string; quantity: number; unitPricePaise: number }>;
}) {
  const products = useActiveProducts();
  const options = (products.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.name} (${p.sku})`,
  }));
  const setLine = (i: number, change: Partial<OrderDraft['lines'][number]>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l, at) => (at === i ? { ...l, ...change } : l)),
    }));
  const discountable = draft.outletType === 'DISTRIBUTOR';
  const net = previewNet(draft.lines, draft);
  const pick = (i: number, productId: string) => {
    const product = (products.data ?? []).find((p) => p.id === productId);
    const price = product ? defaultPricePaise(draft.outletType, product) : null;
    setLine(i, { productId, ...(price !== null && { price: paiseToRupees(price) }) });
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text">Products</p>
      {errors['lines'] ? (
        <p role="alert" className="text-[13px] text-danger-fg">
          {errors['lines']}
        </p>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_6rem_4.5rem_auto] gap-2 text-xs font-medium uppercase tracking-wide text-text-subtle">
        <span>Product</span>
        <span className="text-right">Qty</span>
        <span className="text-right">₹ each</span>
        <span className="text-right" title="Units given free on top: not charged, not in any amount">
          Free
        </span>
        <span className="w-9" />
      </div>
      {draft.lines.map((l, i) => (
        <div key={l.key} className="space-y-1">
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_6rem_4.5rem_auto] items-center gap-2">
            <Select aria-label={`Product ${i + 1}`} value={l.productId} onValueChange={(v) => pick(i, v)} options={options} placeholder="Product" />
            <Input
              aria-label={`Quantity ${i + 1}`}
              inputMode="numeric"
              placeholder="Qty"
              value={l.quantity}
              onChange={(e) => setLine(i, { quantity: e.target.value })}
              className="text-right tabular-nums"
            />
            <Input
              aria-label={`Price ${i + 1} (₹)`}
              inputMode="decimal"
              placeholder="₹ each"
              value={l.price}
              onChange={(e) => setLine(i, { price: e.target.value })}
              className="text-right tabular-nums"
            />
            <Input aria-label={`Free units ${i + 1}`} inputMode="numeric" placeholder="0" value={l.free} onChange={(e) => setLine(i, { free: e.target.value })} className="text-right tabular-nums" />
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
          <div className="flex justify-between gap-3 text-xs text-text-subtle">
            {errors[`line${i}`] ? (
              <span role="alert" className="text-danger-fg">
                {errors[`line${i}`]}
              </span>
            ) : originals ? (
              <OriginalNote line={l} original={originals.get(l.productId)} />
            ) : (
              <span />
            )}
            <span className="tabular-nums">
              {lineAmountPaise(l) === null
                ? ''
                : net.lines[i] !== lineAmountPaise(l) && net.lines[i] !== null
                  ? `${formatMoney(lineAmountPaise(l) ?? 0)} → ${formatMoney(net.lines[i] ?? 0)}`
                  : formatMoney(lineAmountPaise(l) ?? 0)}
            </span>
          </div>
          {discountable ? (
            <div className="flex items-center gap-2 text-xs text-text-subtle">
              <span>Discount on this line</span>
              <DiscountInput label={`Discount ${i + 1}`} kind={l.discKind} value={l.discValue} onChange={(c) => setLine(i, c)} />
            </div>
          ) : null}
        </div>
      ))}
      {originals
        ? [...originals]
            .filter(([id]) => !draft.lines.some((l) => l.productId === id))
            .map(([id, o]) => (
              <p key={id} className="text-xs text-warning-fg">
                Removed: {o.productName}, originally {o.quantity} × {formatMoney(o.unitPricePaise)}
              </p>
            ))
        : null}
      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, emptyLine()] }))}>
          <Plus className="mr-1 h-4 w-4" aria-hidden /> Add a product
        </Button>
        {discountable ? null : <p className="text-sm font-medium tabular-nums">Total {formatMoney(net.totalPaise)}</p>}
      </div>
      {discountable ? (
        <div className="space-y-1 border-t border-border pt-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>Discount on the whole order</span>
            <DiscountInput label="Order discount" kind={draft.discKind} value={draft.discValue} onChange={(c) => setDraft((d) => ({ ...d, ...c }))} />
          </div>
          {errors['discount'] ? (
            <p role="alert" className="text-[13px] text-danger-fg">
              {errors['discount']}
            </p>
          ) : null}
          {net.orderDiscountPaise > 0 ? <p className="text-right text-xs text-text-subtle tabular-nums">Order discount − {formatMoney(net.orderDiscountPaise)}</p> : null}
          <p className="text-right text-sm font-medium tabular-nums">Total {formatMoney(net.totalPaise)}</p>
        </div>
      ) : null}
    </div>
  );
}

/** A distributor or a chemist: the active ones, searched by name. One outlet per order. */
function OutletField({ type, value, onChange, error }: { type: OrderDraft['outletType']; value: string; onChange: (id: string) => void; error?: string | undefined }) {
  const [term, setTerm] = useState('');
  const query = {
    page: 1,
    pageSize: 20,
    status: 'active' as const,
    ...(term.trim() && { search: term.trim() }),
  };
  const distributors = useDistributors(type === 'DISTRIBUTOR' ? query : undefined);
  const chemists = useChemists(type === 'CHEMIST' ? query : undefined);
  const rows = (type === 'DISTRIBUTOR' ? distributors.data?.items : chemists.data?.items) ?? [];
  return (
    <FormField label={type === 'DISTRIBUTOR' ? 'Distributor' : 'Chemist'} htmlFor="order-outlet" error={error}>
      <div className="space-y-2">
        <Input aria-label="Search by name" placeholder="Search by name" value={term} onChange={(e) => setTerm(e.target.value)} />
        <Select
          id="order-outlet"
          value={value}
          onValueChange={onChange}
          options={rows.map((r) => ({ value: r.id, label: r.name }))}
          placeholder={type === 'DISTRIBUTOR' ? 'Choose a distributor' : 'Choose a chemist'}
          aria-invalid={error ? true : undefined}
        />
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
    <FormDialog
      title="Add an order"
      description="Credited to the employee you choose. A distributor order counts as primary once it is marked Done."
      formId="add-order-form"
      pending={add.isPending}
      onClose={onClose}
      onSubmit={submit}
      wide
    >
      <EmployeePickerField id="order-employee" label="Employee" title="Choose the employee" value={draft.userId} onChange={(v) => set('userId', v)} error={errors['userId']} />
      <FormField label="Order for" htmlFor="order-type">
        <Select
          id="order-type"
          value={draft.outletType}
          onValueChange={(v) => setDraft((d) => ({ ...d, outletType: v as OrderDraft['outletType'], outletId: '' }))}
          options={[
            { value: 'DISTRIBUTOR', label: 'A distributor' },
            { value: 'CHEMIST', label: 'A chemist (information only)' },
          ]}
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
  const [draft, setDraft] = useState<Pick<OrderDraft, 'outletType' | 'remarks' | 'lines' | 'discKind' | 'discValue'>>({
    outletType: order.outletType,
    remarks: order.remarks ?? '',
    lines: linesOf(order.items),
    ...discDraftOf(order.discount),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const edit = useEditOrder(order.id, onClose);
  // What the employee ordered: the saved original once the order has been changed, else the order as it stands.
  const originals = new Map(
    (
      order.original ??
      order.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPricePaise: i.unitPricePaise,
      }))
    ).map((o) => [o.productId, o]),
  );

  function submit() {
    const built = buildEdit(draft);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    edit.mutate(built.body);
  }

  return (
    <FormDialog
      title="Change the order"
      description={`${order.outlet.name} · placed by ${order.mr.name}. Employee, outlet and date stay as they are; what they ordered is kept.`}
      formId="edit-order-form"
      pending={edit.isPending}
      onClose={onClose}
      onSubmit={submit}
      wide
    >
      <LinesEditor draft={draft} setDraft={(change) => setDraft((d) => ({ ...d, ...change(d) }))} errors={errors} originals={originals} />
      <FormField label="Remarks (optional)" htmlFor="edit-order-remarks" error={errors['remarks']}>
        <Textarea id="edit-order-remarks" value={draft.remarks} maxLength={REMARKS_MAX} onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))} />
      </FormField>
    </FormDialog>
  );
}

/** Gives a Done order from before invoices its number, so it appears on the Invoices page and payments can be allocated to it. */
export function SetInvoiceNumberDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | undefined>();
  const save = useSetInvoiceNumber(id, onClose);

  function submit() {
    const trimmed = number.trim();
    if (!trimmed) return setError('Enter the invoice number.');
    if (trimmed.length > INVOICE_NUMBER_MAX) return setError(`At most ${INVOICE_NUMBER_MAX} characters.`);
    setError(undefined);
    save.mutate({ invoiceNumber: trimmed });
  }

  return (
    <FormDialog
      title="Add the invoice number"
      description="This order was marked Done before invoice numbers were kept. Once saved, the number cannot be changed."
      formId="invoice-number-form"
      pending={save.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Invoice no." htmlFor="invoice-number" error={error}>
        <Input id="invoice-number" value={number} maxLength={INVOICE_NUMBER_MAX} onChange={(e) => setNumber(e.target.value)} placeholder="e.g. 3452" />
      </FormField>
    </FormDialog>
  );
}

/**
 * Mark a distributor order Done with what was actually delivered: per product the units supplied (up to what was ordered) and any given free on
 * top. It starts as a full supply, so Save with no change is a plain Done. Primary counts the supplied units at the order's prices; free units are
 * stock and sales for the distributor but never rupees. The employee's own order stays as they placed it.
 */
export function CompleteOrderDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useOrderDetail(id);
  const order = query.data;
  const [drafts, setDrafts] = useState<SupplyDraft[] | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const complete = useCompleteOrder(id, onClose);
  const lines = drafts ?? (order ? supplyDraftOf(order.items) : []);
  const set = (i: number, change: Partial<SupplyDraft>) => setDrafts(lines.map((l, at) => (at === i ? { ...l, ...change } : l)));

  function submit() {
    const built = buildSupply(lines, invoiceNumber);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    complete.mutate(built.body);
  }

  return (
    <FormDialog
      title="Mark the order Done"
      {...(order && {
        description: `${order.outlet.name} · placed by ${order.mr.name}. Enter what was actually supplied and the invoice number; it then counts as primary and cannot be changed. GST is added on the invoice.`,
      })}
      formId="complete-order-form"
      pending={complete.isPending}
      disabled={!order}
      onClose={onClose}
      onSubmit={submit}
      wide
    >
      {!order ? (
        <p className="text-sm text-text-muted">{query.error ? 'The order could not be loaded.' : 'Loading…'}</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_4rem_5rem_5rem_4.5rem] items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-subtle">
            <span>Product</span>
            <span className="text-right">Ordered</span>
            <span className="text-right">Supplied</span>
            <span className="text-right">Free</span>
            <span className="text-right">Short</span>
          </div>
          {lines.map((l, i) => {
            const item = order.items[i];
            const short = notSupplied(l);
            return (
              <div key={i} className="space-y-1">
                <div className="grid grid-cols-[minmax(0,1fr)_4rem_5rem_5rem_4.5rem] items-center gap-2">
                  <span className="truncate text-sm">{item?.productName}</span>
                  <span className="text-right text-sm tabular-nums">{l.ordered}</span>
                  <Input
                    aria-label={`Supplied, ${item?.productName}`}
                    inputMode="numeric"
                    value={l.supplied}
                    onChange={(e) => set(i, { supplied: e.target.value })}
                    className="text-right tabular-nums"
                  />
                  <Input aria-label={`Free, ${item?.productName}`} inputMode="numeric" value={l.free} onChange={(e) => set(i, { free: e.target.value })} className="text-right tabular-nums" />
                  <span className="text-right text-sm tabular-nums">{short === null ? '—' : short}</span>
                </div>
                {errors[`line${i}`] ? (
                  <p role="alert" className="text-[13px] text-danger-fg">
                    {errors[`line${i}`]}
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
            <span className="text-text-muted">Ordered {formatMoney(order.totalAmountPaise)}</span>
            <span className="font-medium tabular-nums">Delivered {formatMoney(deliveredPaise(lines))}</span>
          </div>
          <FormField label="Invoice no." htmlFor="complete-order-invoice" error={errors['invoiceNumber']}>
            <Input id="complete-order-invoice" value={invoiceNumber} maxLength={INVOICE_NUMBER_MAX} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. 3452" />
          </FormField>
        </div>
      )}
    </FormDialog>
  );
}
