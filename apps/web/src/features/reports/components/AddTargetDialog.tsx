'use client';

import { useMemo, useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { monthLabel } from '@/features/payroll/lib/payroll';
import { useActiveProducts } from '@/features/field-master-data/hooks/useProducts';
import { istDate } from '@/lib/dates';
import { financialYearOf } from '@/lib/financial-year';
import { rupeesToPaise } from '@/lib/money';
import { useSetTarget } from '../hooks/useEmployeeSales';
import { financialYearMonths } from '../lib/salesDashboard';

const ALL = 'all';

/**
 * Set a target for one employee: a product (or all products), a run of whole months of the current financial year — one month, a quarter, the
 * year, anything between — and an amount in rupees at PTR. Setting the same product and months again replaces the amount.
 */
export function AddTargetDialog({
  userId,
  name,
  from,
  to,
  onClose,
}: {
  userId: string;
  name: string;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const months = useMemo(() => financialYearMonths(financialYearOf(istDate())), []);
  const [fromMonth, setFromMonth] = useState(months.includes(from) ? from : (months[0] ?? from));
  const [toMonth, setToMonth] = useState(months.includes(to) ? to : fromMonth);
  const [productId, setProductId] = useState(ALL);
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; months?: string }>({});
  const products = useActiveProducts();
  const save = useSetTarget(onClose);
  const monthOptions = months.map((m) => ({ value: m, label: monthLabel(m) }));

  function submit() {
    const paise = rupeesToPaise(amount);
    const found = {
      ...(paise === null || paise === 0 ? { amount: 'Enter an amount in rupees, more than zero.' } : {}),
      ...(toMonth < fromMonth ? { months: 'The last month cannot be before the first.' } : {}),
    };
    setErrors(found);
    if (Object.keys(found).length > 0 || !paise) return;
    save.mutate({
      userId,
      month: fromMonth,
      toMonth,
      productId: productId === ALL ? null : productId,
      targetAmountPaise: paise,
    });
  }

  return (
    <FormDialog
      title={`Set a target: ${name}`}
      description="For a run of whole months of the current financial year. The amount is spread evenly over its months; setting the same product and months again replaces it."
      formId="add-target-form"
      pending={save.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Product" htmlFor="target-product">
        <Select
          id="target-product"
          value={productId}
          onValueChange={setProductId}
          options={[
            { value: ALL, label: 'All products' },
            ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="From month" htmlFor="target-from">
          <Select
            id="target-from"
            value={fromMonth}
            onValueChange={(m) => {
              setFromMonth(m);
              if (toMonth < m) setToMonth(m);
            }}
            options={monthOptions}
          />
        </FormField>
        <FormField label="To month" htmlFor="target-to" error={errors.months}>
          <Select id="target-to" value={toMonth} onValueChange={setToMonth} options={monthOptions} />
        </FormField>
      </div>
      <FormField
        label="Target (₹)"
        htmlFor="target-amount"
        error={errors.amount}
        hint="Secondary sales at PTR over all of these months."
      >
        <Input
          id="target-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={errors.amount ? true : undefined}
        />
      </FormField>
    </FormDialog>
  );
}
