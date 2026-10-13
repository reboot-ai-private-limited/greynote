'use client';

import type { ExpenseReviewDayDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { formatDate, formatMoney } from '@/lib/format';
import { useAdjustDay } from '../hooks/useExpenses';
import { addableTypes, buildDayOps, emptyDayForm, rowTypeLabel, type DayForm } from '../lib/expenseAdjust';

const hintOf = (row: ExpenseReviewDayDto['rows'][number]): { hint?: string } => {
  if (row.paid) return { hint: 'Already paid: it cannot be changed.' };
  if (row.originalAmountPaise !== null && row.originalAmountPaise !== row.amountPaise) return { hint: `First amount ${formatMoney(row.originalAmountPaise)}` };
  return {};
};

/**
 * HR changes one day's amounts: every row can be raised or lowered (to zero too), and a TA or DA the day does not have can be added. One
 * reason covers the changes; each is kept with what it was before, who and when, and is shown to everyone who reads the month.
 */
export function AdjustDayDialog({ userId, day, onClose }: { userId: string; day: ExpenseReviewDayDto; onClose: () => void }) {
  const [form, setForm] = useState<DayForm>(() => emptyDayForm(day));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const adjust = useAdjustDay(onClose);

  function submit() {
    const built = buildDayOps(day, form);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    adjust.mutate({ userId, date: day.date, reason: built.reason, ops: built.ops });
  }

  return (
    <FormDialog
      title={`Change ${formatDate(day.date)}`}
      description="Raise or lower an amount, or add a TA or DA the day does not have. The employee and everyone reviewing the month will see what it was and why you changed it."
      formId="adjust-day-form"
      pending={adjust.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      {day.rows.map((row) => (
        <FormField
          key={row.id}
          label={`${rowTypeLabel(row.type)}${row.remarks ? ` · ${row.remarks}` : ''}`}
          htmlFor={`adjust-${row.id}`}
          error={errors[row.id]}
          {...hintOf(row)}
        >
          <Input
            id={`adjust-${row.id}`}
            inputMode="decimal"
            disabled={row.paid}
            value={form.amounts[row.id] ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, amounts: { ...f.amounts, [row.id]: e.target.value } }))}
            aria-invalid={errors[row.id] ? true : undefined}
          />
        </FormField>
      ))}
      {addableTypes(day).map((type) => (
        <FormField key={type} label={`Add ${type}`} htmlFor={`add-${type}`} error={errors[`add-${type}`]} hint={`This day has no ${type}. Leave empty to add nothing.`}>
          <Input
            id={`add-${type}`}
            inputMode="decimal"
            placeholder="0.00"
            value={form.adds[type] ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, adds: { ...f.adds, [type]: e.target.value } }))}
            aria-invalid={errors[`add-${type}`] ? true : undefined}
          />
        </FormField>
      ))}
      <FormField label="Reason" htmlFor="adjust-reason" error={errors['reason']}>
        <Textarea id="adjust-reason" maxLength={500} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} aria-invalid={errors['reason'] ? true : undefined} />
      </FormField>
      {errors['form'] ? (
        <p role="alert" className="text-sm text-danger-fg">
          {errors['form']}
        </p>
      ) : null}
    </FormDialog>
  );
}
