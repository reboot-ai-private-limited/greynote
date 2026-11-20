'use client';

import type { EmployeeTargetFigureDto } from '@greynote/contracts';
import { useMemo, useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useActiveProducts } from '@/features/field-master-data/hooks/useProducts';
import { istDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { financialYearOf } from '@/lib/financial-year';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';
import { useUpdateTarget } from '../hooks/useEmployeeSales';
import { financialYearMonths } from '../lib/salesDashboard';
import { buildTargetBody, targetDraft, type TargetDraft } from '../lib/targetForm';

/**
 * Edit one product's target: its product, its run of whole months of the current financial year, and its amount in rupees at PTS or its
 * units (the two follow each other at the product's PTS). It changes that target in place; it can't become a copy of another one the
 * employee already has. New targets are set with `SetTargetDialog`.
 */
export function EditTargetDialog({ name, target, onClose }: { name: string; target: EmployeeTargetFigureDto; onClose: () => void }) {
  const months = useMemo(() => financialYearMonths(financialYearOf(istDate())), []);
  const [draft, setDraft] = useState<TargetDraft>(() => targetDraft(months, { from: target.fromMonth, to: target.toMonth }, target));
  const [errors, setErrors] = useState<{ product?: string; amount?: string; months?: string }>({});
  const products = useActiveProducts();
  const update = useUpdateTarget(onClose);
  const set = (patch: Partial<TargetDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const pts = (products.data ?? []).find((p) => p.id === draft.productId)?.ptsPaise ?? null;
  const typeUnits = (v: string) => set({ units: v, ...(pts && /^\d+$/.test(v.trim()) ? { amount: paiseToRupees(Number(v) * pts) } : {}) });
  const typeAmount = (v: string) => {
    const paise = rupeesToPaise(v);
    set({ amount: v, ...(pts && paise ? { units: String(Math.round(paise / pts)) } : {}) });
  };
  const monthOptions = months.map((m) => ({ value: m, label: monthLabel(m) }));
  // A product no longer active still shows on the target being edited, so the picker isn't blank.
  const productOptions = [
    ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    ...(target.product && !(products.data ?? []).some((p) => p.id === target.product!.id) ? [{ value: target.product.id, label: target.product.name }] : []),
  ];

  function submit() {
    const built = buildTargetBody(draft, pts);
    setErrors(built.ok ? {} : built.errors);
    if (!built.ok) return;
    update.mutate({ id: target.id, body: built.body });
  }

  return (
    <FormDialog
      title={`Edit target: ${name}`}
      description="Change the product, the months or the amount of this target. The amount is spread evenly over its months."
      formId="edit-target-form"
      pending={update.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Product" htmlFor="target-product" error={errors.product}>
        <SearchableSelect id="target-product" value={draft.productId} onValueChange={(id) => set({ productId: id, units: '' })} options={productOptions} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="From month" htmlFor="target-from">
          <Select id="target-from" value={draft.fromMonth} onValueChange={(m) => set({ fromMonth: m, ...(draft.toMonth < m ? { toMonth: m } : {}) })} options={monthOptions} />
        </FormField>
        <FormField label="To month" htmlFor="target-to" error={errors.months}>
          <Select id="target-to" value={draft.toMonth} onValueChange={(m) => set({ toMonth: m })} options={monthOptions} />
        </FormField>
      </div>
      <FormField label="Target (₹)" htmlFor="target-amount" error={errors.amount} hint="Secondary sales at PTS over all of these months.">
        <Input id="target-amount" inputMode="decimal" value={draft.amount} onChange={(e) => typeAmount(e.target.value)} aria-invalid={errors.amount ? true : undefined} />
      </FormField>
      {pts ? (
        <FormField label="Target (units)" htmlFor="target-units" hint={`Units × PTS (${formatMoney(pts)}) is the amount; typing either fills the other.`}>
          <Input id="target-units" inputMode="numeric" value={draft.units} onChange={(e) => typeUnits(e.target.value)} />
        </FormField>
      ) : null}
    </FormDialog>
  );
}
