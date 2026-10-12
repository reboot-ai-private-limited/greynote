'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmployeePickerField } from '@/features/people/components/EmployeePickerField';
import { businessTimeZone } from '@/lib/siteConfig';
import { useGrantLate } from '../hooks/useLateGrants';
import { buildGrant, type GrantForm } from '../lib/lateGrants';

/** Lets one employee submit one plan after its deadline, until a date and time Admin picks (business timezone). */
export function GrantLateDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<GrantForm>({
    userId: '',
    kind: 'MONTHLY_PLAN',
    planKey: '',
    reason: '',
    expiresAt: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const grant = useGrantLate(onClose);
  const set = <K extends keyof GrantForm>(key: K, value: GrantForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit() {
    const built = buildGrant(form, businessTimeZone());
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    grant.mutate(built.body);
  }

  const monthly = form.kind === 'MONTHLY_PLAN';
  return (
    <FormDialog
      title="Allow a late submission"
      description="One employee can submit one plan after its deadline, once, until the time you set."
      formId="grant-late-form"
      pending={grant.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <EmployeePickerField
        id="grant-user"
        label="Employee"
        title="Choose an employee"
        value={form.userId}
        onChange={(v) => set('userId', v)}
        error={errors['userId']}
      />
      <FormField label="Plan" htmlFor="grant-kind">
        <Select
          id="grant-kind"
          value={form.kind}
          onValueChange={(v) =>
            setForm((f) => ({ ...f, kind: v as GrantForm['kind'], planKey: '' }))
          }
          options={[
            { value: 'MONTHLY_PLAN', label: 'Monthly plan' },
            { value: 'DAILY_PLAN', label: 'Daily plan' },
          ]}
        />
      </FormField>
      <FormField label={monthly ? 'Month' : 'Date'} htmlFor="grant-key" error={errors['planKey']}>
        <Input
          id="grant-key"
          type={monthly ? 'month' : 'date'}
          value={form.planKey}
          onChange={(e) => set('planKey', e.target.value)}
          aria-invalid={errors['planKey'] ? true : undefined}
        />
      </FormField>
      <FormField
        label="Allowed until"
        htmlFor="grant-until"
        error={errors['expiresAt']}
        hint={`Date and time in ${businessTimeZone()}. Leave empty for the default length.`}
      >
        <div className="flex items-center gap-2">
          <Input
            id="grant-until"
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
      <FormField label="Reason" htmlFor="grant-reason" error={errors['reason']}>
        <Textarea
          id="grant-reason"
          maxLength={1000}
          value={form.reason}
          onChange={(e) => set('reason', e.target.value)}
          aria-invalid={errors['reason'] ? true : undefined}
        />
      </FormField>
    </FormDialog>
  );
}
