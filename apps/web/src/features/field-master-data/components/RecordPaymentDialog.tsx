'use client';

import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { istDate } from '@/lib/dates';
import { useRecordPayment } from '../hooks/useDistributorPayments';
import {
  MODE_OPTIONS,
  NOTE_MAX,
  REFERENCE_MAX,
  buildPayment,
  emptyPayment,
  type PaymentDraft,
} from '../lib/payments';

/** Money received from the distributor: the day, the amount, how it was paid, and optionally a reference number and a note. */
export function RecordPaymentDialog({
  distributorId,
  onClose,
}: {
  distributorId: string;
  onClose: () => void;
}) {
  const today = istDate();
  const [draft, setDraft] = useState<PaymentDraft>(emptyPayment(today));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const record = useRecordPayment(onClose);
  const set =
    <K extends keyof PaymentDraft>(field: K) =>
    (value: PaymentDraft[K]) =>
      setDraft((d) => ({ ...d, [field]: value }));
  const invalid = (field: string) => (errors[field] ? true : undefined);

  function submit() {
    const built = buildPayment(distributorId, draft, today);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    record.mutate(built.body);
  }

  return (
    <FormDialog
      title="Record a payment"
      formId="record-payment-form"
      pending={record.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Date received" htmlFor="pay-date" error={errors['paymentDate']}>
        <Input
          id="pay-date"
          type="date"
          max={today}
          value={draft.paymentDate}
          onChange={(e) => set('paymentDate')(e.target.value)}
          aria-invalid={invalid('paymentDate')}
        />
      </FormField>
      <FormField label="Amount (₹)" htmlFor="pay-amount" error={errors['amount']}>
        <Input
          id="pay-amount"
          inputMode="decimal"
          value={draft.amount}
          onChange={(e) => set('amount')(e.target.value)}
          aria-invalid={invalid('amount')}
        />
      </FormField>
      <FormField label="Paid by" htmlFor="pay-mode" error={errors['mode']}>
        <Select
          id="pay-mode"
          value={draft.mode}
          onValueChange={(v) => set('mode')(v as PaymentDraft['mode'])}
          options={MODE_OPTIONS}
          placeholder="Choose"
          aria-invalid={invalid('mode')}
        />
      </FormField>
      <FormField label="Reference (optional)" htmlFor="pay-reference" error={errors['reference']}>
        <Input
          id="pay-reference"
          value={draft.reference}
          maxLength={REFERENCE_MAX}
          onChange={(e) => set('reference')(e.target.value)}
          placeholder="Cheque or transaction number"
        />
      </FormField>
      <FormField label="Note (optional)" htmlFor="pay-note" error={errors['note']}>
        <Textarea
          id="pay-note"
          value={draft.note}
          maxLength={NOTE_MAX}
          onChange={(e) => set('note')(e.target.value)}
        />
      </FormField>
    </FormDialog>
  );
}
