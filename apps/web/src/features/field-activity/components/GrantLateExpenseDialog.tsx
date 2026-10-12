'use client';

import { useState } from 'react';
import type { ExpenseGrantPhaseDto } from '@greynote/contracts';
import { Button } from '@/components/ui/Button';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmployeePickerField } from '@/features/people/components/EmployeePickerField';
import { businessTimeZone } from '@/lib/siteConfig';
import { useGrantExpenseMonth } from '../hooks/useExpenses';
import {
  buildExpenseGrant,
  EXPENSE_GRANT_PHASE_LABEL,
  type ExpenseGrantForm,
} from '../lib/expenseGrants';

/** Lets one employee's month of expenses be sent, or approved, after its deadline — once, until a time Admin picks. */
export function GrantLateExpenseDialog({
  onClose,
  initial,
}: {
  onClose: () => void;
  /** Pre-fills the form, e.g. from an approval that is past its deadline. */
  initial?: Partial<Pick<ExpenseGrantForm, 'userId' | 'month' | 'phase'>>;
}) {
  const [form, setForm] = useState<ExpenseGrantForm>({
    userId: '',
    month: '',
    phase: 'SUBMIT',
    reason: '',
    expiresAt: '',
    ...initial,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const grant = useGrantExpenseMonth(onClose);
  const set = <K extends keyof ExpenseGrantForm>(key: K, value: ExpenseGrantForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit() {
    const built = buildExpenseGrant(form, businessTimeZone());
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    grant.mutate(built.body);
  }

  return (
    <FormDialog
      title="Allow late expenses"
      description="One employee's month can be sent or approved after its deadline, once, until the time you set. Not possible once any of the month is paid."
      formId="grant-late-expense-form"
      pending={grant.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <EmployeePickerField
        id="grant-expense-user"
        label="Employee"
        title="Choose an employee"
        value={form.userId}
        onChange={(v) => set('userId', v)}
        error={errors['userId']}
      />
      <FormField
        label="Month of the expenses"
        htmlFor="grant-expense-month"
        error={errors['month']}
      >
        <Input
          id="grant-expense-month"
          type="month"
          value={form.month}
          onChange={(e) => set('month', e.target.value)}
          aria-invalid={errors['month'] ? true : undefined}
        />
      </FormField>
      <FormField label="Allow" htmlFor="grant-expense-phase">
        <Select
          id="grant-expense-phase"
          value={form.phase}
          onValueChange={(v) => set('phase', v as ExpenseGrantPhaseDto)}
          options={(Object.keys(EXPENSE_GRANT_PHASE_LABEL) as ExpenseGrantPhaseDto[]).map(
            (value) => ({ value, label: EXPENSE_GRANT_PHASE_LABEL[value] }),
          )}
        />
      </FormField>
      <FormField
        label="Allowed until"
        htmlFor="grant-expense-until"
        error={errors['expiresAt']}
        hint={`Date and time in ${businessTimeZone()}. Leave empty for the default length.`}
      >
        <div className="flex items-center gap-2">
          <Input
            id="grant-expense-until"
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => set('expiresAt', e.target.value)}
            aria-invalid={errors['expiresAt'] ? true : undefined}
          />
          {form.expiresAt ? (
            <Button variant="ghost" size="sm" onClick={() => set('expiresAt', '')}>
              Clear
            </Button>
          ) : null}
        </div>
      </FormField>
      <FormField label="Reason" htmlFor="grant-expense-reason" error={errors['reason']}>
        <Textarea
          id="grant-expense-reason"
          maxLength={1000}
          value={form.reason}
          onChange={(e) => set('reason', e.target.value)}
          aria-invalid={errors['reason'] ? true : undefined}
        />
      </FormField>
    </FormDialog>
  );
}
