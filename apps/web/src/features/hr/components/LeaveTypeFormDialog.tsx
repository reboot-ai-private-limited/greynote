'use client';

import type { LeaveTypeDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCreateLeaveType, useUpdateLeaveType } from '../hooks/useLeaveTypes';
import { EMPTY_LEAVE_TYPE, buildLeaveType, buildLeaveTypeUpdate, leaveTypeToDraft, type LeaveTypeDraft, type PaidChoice } from '../lib/leaveTypes';

const PAID_OPTIONS = [
  { value: 'paid', label: 'Paid: drawn from a balance' },
  { value: 'unpaid', label: 'Unpaid: no balance, deducted from pay' },
];

/** Create (no `type`) or edit (`type`). Mounted only while open, so its draft is fresh each time. */
export function LeaveTypeFormDialog({ type, onClose }: { type?: LeaveTypeDto | undefined; onClose: () => void }) {
  const [draft, setDraft] = useState<LeaveTypeDraft>(type ? leaveTypeToDraft(type) : EMPTY_LEAVE_TYPE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateLeaveType(onClose);
  const update = useUpdateLeaveType(onClose);

  function submit() {
    if (type) {
      const built = buildLeaveTypeUpdate(type, draft);
      if (!built.ok) return setErrors(built.errors);
      if (Object.keys(built.body).length === 0) return onClose();
      return update.mutate({ id: type.id, body: built.body });
    }
    const built = buildLeaveType(draft);
    if (!built.ok) return setErrors(built.errors);
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title={type ? 'Edit leave type' : 'New leave type'}
      description="A paid type has a balance per leave year; an unpaid one does not, and feeds the pay deduction."
      formId="leave-type-form"
      pending={create.isPending || update.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Name" htmlFor="leave-type-name" error={errors['name']}>
        <Input id="leave-type-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} aria-invalid={errors['name'] ? true : undefined} />
      </FormField>
      <FormField
        label="Paid or unpaid"
        htmlFor="leave-type-paid"
        error={errors['paid']}
        {...(type ? { hint: 'Fixed once the type is in use: a grade, a balance or a leave already depends on it.' } : {})}
      >
        <Select
          id="leave-type-paid"
          value={draft.paid}
          onValueChange={(v) => setDraft((d) => ({ ...d, paid: v as PaidChoice }))}
          options={PAID_OPTIONS}
          placeholder="Choose"
          aria-invalid={errors['paid'] ? true : undefined}
        />
      </FormField>
      <label className="flex cursor-pointer items-start gap-3 text-sm text-text">
        <input
          type="checkbox"
          checked={draft.allowsProof}
          onChange={(e) => setDraft((d) => ({ ...d, allowsProof: e.target.checked }))}
          className="mt-0.5 size-4 rounded border-border-strong accent-[var(--color-accent)]"
        />
        <span>
          Employees can attach proof
          <span className="block text-[13px] text-text-subtle">A prescription or medical certificate (PDF, JPG or PNG; up to 3 files of 5 MB). Always optional: a request never needs it.</span>
        </span>
      </label>
    </FormDialog>
  );
}
