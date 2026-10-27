'use client';

import type { DistributorPaymentDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/Input';
import { StatTile } from '@/components/ui/StatTile';
import { toErrorState } from '@/lib/api/toErrorState';
import { rangeError } from '@/lib/dateRange';
import { istDate } from '@/lib/dates';
import { financialYearOf, financialYearRange } from '@/lib/financial-year';
import { formatMoney } from '@/lib/format';
import { useFinancialYear, useIsReadOnly } from '@/lib/useFinancialYear';
import { useCancelPayment, useDistributorPayments } from '../hooks/useDistributorPayments';
import {
  MODE_LABEL,
  PAYMENT_RANGE_OPTIONS,
  collectedPercent,
  paymentRange,
  type PaymentRange,
} from '../lib/payments';
import { RecordPaymentDialog } from './RecordPaymentDialog';

const money = (paise: number): string => formatMoney(paise);

/** Everything collected from this distributor in a range, next to what it ordered, with a way to record a payment or cancel a wrong one. */
export function DistributorPaymentsTab({
  distributorId,
  inactive,
}: {
  distributorId: string;
  inactive: boolean;
}) {
  const today = istDate();
  const { year } = useFinancialYear();
  const fy = financialYearRange(year ?? financialYearOf(today));
  const [preset, setPreset] = useState<PaymentRange>('month');
  const [custom, setCustom] = useState({ from: fy.from, to: fy.to < today ? fy.to : today });
  const range = preset === 'custom' ? custom : paymentRange(preset, today, fy);
  const problem = preset === 'custom' ? rangeError(range.from, range.to) : undefined;
  const query = useDistributorPayments({ distributorId, ...range }, !problem);
  const readOnly = useIsReadOnly();
  const [recording, setRecording] = useState(false);
  const [cancelling, setCancelling] = useState<DistributorPaymentDto | null>(null);
  const data = query.data;
  const percent = data ? collectedPercent(data.collectedPaise, data.orderedPaise) : null;

  const columns: readonly Column<DistributorPaymentDto>[] = [
    { key: 'date', header: 'Date', render: (p) => p.paymentDate },
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      render: (p) => (
        <span
          className={p.status === 'CANCELLED' ? 'text-text-subtle line-through' : 'font-medium'}
        >
          {money(p.amountPaise)}
        </span>
      ),
    },
    { key: 'mode', header: 'Paid by', render: (p) => MODE_LABEL[p.mode] },
    { key: 'ref', header: 'Reference', render: (p) => p.reference ?? '—' },
    {
      key: 'invoices',
      header: 'Invoices',
      render: (p) =>
        p.allocations.length === 0
          ? 'On account'
          : p.allocations.map((a) => `${a.invoiceNumber ?? '—'} (${money(a.amountPaise)})`).join(', '),
    },
    {
      key: 'note',
      header: 'Note',
      render: (p) =>
        p.status === 'CANCELLED' ? (
          <span className="text-text-subtle">Cancelled: {p.cancelReason}</span>
        ) : (
          (p.note ?? '—')
        ),
    },
    { key: 'by', header: 'Entered by', render: (p) => p.recordedBy.name },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Badge tone={p.status === 'RECORDED' ? 'success' : 'neutral'}>
          {p.status === 'RECORDED' ? 'Recorded' : 'Cancelled'}
        </Badge>
      ),
    },
    {
      key: 'cancel',
      header: '',
      render: (p) =>
        p.status === 'RECORDED' ? (
          <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => setCancelling(p)}>
            Cancel
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Dues"
          value={money(data?.dues.duesPaise ?? 0)}
          tone={data && data.dues.duesPaise > 0 ? 'warning' : 'success'}
          note={data ? `Opening ${money(data.dues.openingPaise)} + delivered ${money(data.dues.deliveredPaise)} − paid ${money(data.dues.collectedPaise)}` : undefined}
        />
        <StatTile label="Collected" value={money(data?.collectedPaise ?? 0)} tone="success" />
        <StatTile
          label="Ordered"
          value={money(data?.orderedPaise ?? 0)}
          note="Done orders as delivered; the rest as ordered"
        />
        <StatTile label="Collected of ordered" value={percent === null ? '—' : `${percent}%`} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter
          value={{ preset, from: range.from, to: range.to }}
          presets={PAYMENT_RANGE_OPTIONS}
          max={fy.to}
          error={problem}
          onChange={(next) => {
            if (next.preset !== undefined) setPreset(next.preset as PaymentRange);
            if (next.from !== undefined || next.to !== undefined)
              setCustom((c) => ({ from: next.from ?? c.from, to: next.to ?? c.to }));
          }}
        />
        <Button
          disabled={readOnly || inactive}
          title={
            readOnly
              ? 'A past financial year is read-only'
              : inactive
                ? 'Reactivate the distributor first'
                : undefined
          }
          onClick={() => setRecording(true)}
        >
          Record payment
        </Button>
      </div>
      <DataState
        isLoading={!problem && query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!problem && !!data && data.payments.length === 0}
        empty={{ title: 'No payments in this period' }}
      >
        <DataTable
          columns={columns}
          rows={data?.payments ?? []}
          rowKey={(p) => p.id}
          bleed={false}
        />
      </DataState>
      {recording ? (
        <RecordPaymentDialog distributorId={distributorId} onClose={() => setRecording(false)} />
      ) : null}
      {cancelling ? (
        <CancelPaymentDialog payment={cancelling} onClose={() => setCancelling(null)} />
      ) : null}
    </div>
  );
}

function CancelPaymentDialog({
  payment,
  onClose,
}: {
  payment: DistributorPaymentDto;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const cancel = useCancelPayment(onClose);
  function submit() {
    if (reason.trim() === '') return setError('Say why it is cancelled.');
    cancel.mutate({ id: payment.id, reason: reason.trim() });
  }
  return (
    <FormDialog
      title={`Cancel the payment of ${money(payment.amountPaise)}`}
      description="It stays in the list, marked cancelled, and is left out of the totals."
      formId="cancel-payment-form"
      pending={cancel.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Reason" htmlFor="cancel-reason" error={error}>
        <Textarea
          id="cancel-reason"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </FormField>
    </FormDialog>
  );
}
