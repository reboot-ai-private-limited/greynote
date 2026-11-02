'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { Select } from '@/components/ui/Select';
import { EmployeePickerField } from '@/features/people/components/EmployeePickerField';
import { businessTimeZone } from '@/lib/siteConfig';
import { useGrantLate, useLateGrantPreview } from '../hooks/useLateGrants';
import { buildGrant, isDayKind, kindOptions, type GrantForm } from '../lib/lateGrants';

/**
 * Lets one employee do one late thing — send a plan, send or approve a month of expenses, enter a closed month's stock — until a date and
 * time Admin picks (business timezone). Once employee, kind and period are chosen, the server says whether that period is still open to
 * a late entry (payroll finalized, expenses paid…); if not, the reason shows and the button stays off.
 */
export function GrantLateDialog({
  onClose,
  initial,
  groups,
}: {
  onClose: () => void;
  /** Pre-fills the form, e.g. from an expense month that is past its deadline. */
  initial?: Partial<Pick<GrantForm, 'userId' | 'kind' | 'periodKey'>>;
  /** Offer only these groups of kinds (`Plans`, `Expenses`, `Sales`); all when absent. */
  groups?: readonly string[];
}) {
  const options = kindOptions(groups);
  const [form, setForm] = useState<GrantForm>({
    userId: '',
    kind: (options[0]?.value ?? 'MONTHLY_PLAN') as GrantForm['kind'],
    periodKey: '',
    reason: '',
    expiresAt: '',
    ...initial,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const grant = useGrantLate(onClose);
  const set = <K extends keyof GrantForm>(key: K, value: GrantForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const day = isDayKind(form.kind);
  const periodValid = day ? /^\d{4}-\d{2}-\d{2}$/.test(form.periodKey) : /^\d{4}-(0[1-9]|1[0-2])$/.test(form.periodKey);
  const preview = useLateGrantPreview({ userId: form.userId, kind: form.kind, periodKey: form.periodKey }, Boolean(form.userId) && periodValid);
  const locked = preview.data?.lockedReason ?? null;

  function submit() {
    const built = buildGrant(form, businessTimeZone());
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    grant.mutate(built.body);
  }

  return (
    <FormDialog
      title="Allow a late submission"
      description="One employee can do one late thing, once for the period you pick, until the time you set. Not possible once the money for that period is settled."
      formId="grant-late-form"
      pending={grant.isPending}
      disabled={locked !== null}
      onClose={onClose}
      onSubmit={submit}
    >
      <EmployeePickerField id="grant-user" label="Employee" title="Choose an employee" value={form.userId} onChange={(v) => set('userId', v)} error={errors['userId']} />
      <FormField label="What" htmlFor="grant-kind">
        <Select id="grant-kind" value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as GrantForm['kind'], periodKey: '' }))} options={options} />
      </FormField>
      <FormField label={day ? 'Date' : 'Month'} htmlFor="grant-key" error={errors['periodKey']}>
        {day ? (
          <Input id="grant-key" type="date" value={form.periodKey} onChange={(e) => set('periodKey', e.target.value)} aria-invalid={errors['periodKey'] ? true : undefined} />
        ) : (
          <MonthPicker id="grant-key" value={form.periodKey} onChange={(v) => set('periodKey', v)} aria-invalid={errors['periodKey'] ? true : undefined} />
        )}
      </FormField>
      {locked ? (
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg">
          {locked}
        </p>
      ) : null}
      <FormField
        label="Allowed until"
        htmlFor="grant-until"
        error={errors['expiresAt']}
        hint={`Date and time in ${businessTimeZone()}. Leave empty for the default length.${day ? ' A daily plan’s exception ends at the latest at the end of its day.' : ''}`}
      >
        <div className="flex items-center gap-2">
          <Input id="grant-until" type="datetime-local" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} aria-invalid={errors['expiresAt'] ? true : undefined} />
          {form.expiresAt ? (
            <Button variant="ghost" size="sm" onClick={() => set('expiresAt', '')}>
              Clear
            </Button>
          ) : null}
        </div>
      </FormField>
      <FormField label="Reason" htmlFor="grant-reason" error={errors['reason']}>
        <Textarea id="grant-reason" maxLength={1000} value={form.reason} onChange={(e) => set('reason', e.target.value)} aria-invalid={errors['reason'] ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}
