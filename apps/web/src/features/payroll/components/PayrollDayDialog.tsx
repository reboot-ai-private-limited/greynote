'use client';

import type { PayrollDayDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { formatDate } from '@/lib/format';
import { useOverrideDay } from '../hooks/usePayroll';
import { chargeLabel, PAYROLL_DAY_LABEL } from '../lib/payroll';

const CHOICES = [0, 0.5, 1] as const;

/**
 * HR charges one day of a draft differently from what the rules gave (an absent day not charged, a worked day charged). A reason is
 * required; the change is kept with who made it, and the leave or attendance behind the day is not touched.
 */
export function PayrollDayDialog({ runId, day, current, onClose }: { runId: string; day: PayrollDayDto; current: number; onClose: () => void }) {
  const [setDays, setSetDays] = useState<number>(current);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const save = useOverrideDay(runId, onClose);

  function submit() {
    if (reason.trim() === '') return setError('A reason is required.');
    if (setDays === current) return setError('Choose a different charge for the day.');
    setError('');
    save.mutate({ date: day.date, setDays, reason: reason.trim() });
  }

  return (
    <FormDialog
      title={`Charge ${formatDate(day.date)}`}
      description={`${PAYROLL_DAY_LABEL[day.status] ?? day.status}${day.leaveType ? ` · ${day.leaveType}` : ''}. The rules charge ${chargeLabel(day.deductedDays)}. A day not charged adds a day of pay; a day charged takes one off.`}
      formId="payroll-day-form"
      pending={save.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Charge this day" htmlFor="payroll-day-charge">
        <Select id="payroll-day-charge" value={String(setDays)} onValueChange={(v) => setSetDays(Number(v))} options={CHOICES.map((d) => ({ value: String(d), label: d === 0 ? 'Not charged' : d === 0.5 ? 'Half a day' : 'A whole day' }))} />
      </FormField>
      <FormField label="Reason" htmlFor="payroll-day-reason" {...(error ? { error } : {})}>
        <Textarea id="payroll-day-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={error ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}
