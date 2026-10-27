'use client';

import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useInvoices } from '@/features/invoices/hooks/useInvoices';
import { istDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { rupeesToPaise } from '@/lib/money';
import { useRecordPayment } from '../hooks/useDistributorPayments';
import {
  MODE_OPTIONS,
  NOTE_MAX,
  REFERENCE_MAX,
  allocatedPaise,
  autoAllocate,
  buildPayment,
  emptyPayment,
  openInvoices,
  type PaymentDraft,
} from '../lib/payments';

/**
 * Money received from the distributor: the day, the amount, how it was paid, and optionally a reference number and a note. The payment can be
 * spread over the distributor's open invoices (an amount against each); what is not allocated stays on account.
 */
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
  const invoicesQuery = useInvoices({ distributorId });
  const open = openInvoices(invoicesQuery.data ?? []);
  const amountPaise = rupeesToPaise(draft.amount);
  const allocated = allocatedPaise(draft.allocations);
  const setAllocation = (orderId: string, value: string) => setDraft((d) => ({ ...d, allocations: { ...d.allocations, [orderId]: value } }));
  const set =
    <K extends keyof PaymentDraft>(field: K) =>
    (value: PaymentDraft[K]) =>
      setDraft((d) => ({ ...d, [field]: value }));
  const invalid = (field: string) => (errors[field] ? true : undefined);

  function submit() {
    const built = buildPayment(distributorId, draft, today, invoicesQuery.data ?? []);
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
      wide
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
      {open.length > 0 ? (
        <div className="space-y-2" aria-label="Pay against invoices">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Against invoices (optional)</span>
            <Button
              type="button"
              variant="secondary"
              disabled={amountPaise === null || amountPaise <= 0}
              onClick={() => amountPaise !== null && setDraft((d) => ({ ...d, allocations: autoAllocate(amountPaise, open) }))}
            >
              Fill oldest first
            </Button>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem_6rem_7rem] items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-subtle">
            <span>Invoice</span>
            <span>Date</span>
            <span className="text-right">Due</span>
            <span className="text-right">Pay (₹)</span>
          </div>
          {open.map((inv) => (
            <div key={inv.orderId} className="grid grid-cols-[minmax(0,1fr)_6rem_6rem_7rem] items-center gap-2">
              <span className="truncate text-sm">{inv.invoiceNumber}</span>
              <span className="text-sm tabular-nums">{inv.invoiceDate}</span>
              <span className="text-right text-sm tabular-nums">{formatMoney(inv.duePaise)}</span>
              <Input
                aria-label={`Pay against invoice ${inv.invoiceNumber}`}
                inputMode="decimal"
                value={draft.allocations[inv.orderId] ?? ''}
                onChange={(e) => setAllocation(inv.orderId, e.target.value)}
                className="text-right tabular-nums"
              />
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
            <span className="text-text-muted">Allocated {formatMoney(allocated)}</span>
            <span className="font-medium tabular-nums">On account {formatMoney(Math.max((amountPaise ?? 0) - allocated, 0))}</span>
          </div>
          {errors['allocations'] ? (
            <p role="alert" className="text-[13px] text-danger-fg">
              {errors['allocations']}
            </p>
          ) : null}
        </div>
      ) : null}
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
