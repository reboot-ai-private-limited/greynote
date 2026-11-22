'use client';

import type { DoctorGiftDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { useDesignations } from '@/features/people/hooks/useMasterData';
import { DoctorPickerField } from '@/features/field-master-data/components/DoctorPickerField';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate, formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAcceptGift, useAllocateGift, useDoctorGifts, useRejectGift } from '../hooks/useDoctorSpend';
import { GiftDetailDialog, giftMadeByLabel } from './GiftDetailDialog';
import { buildGift, EMPTY_GIFT, type GiftDraft } from '../lib/doctorSpend';

const ANY = 'all';
const NOT_GIVEN = 'not-given';
const STATUS_OPTIONS = [
  { value: ANY, label: 'All gifts' },
  { value: NOT_GIVEN, label: 'Not given yet' },
  { value: 'REQUESTED', label: 'Requested (waiting for you)' },
  { value: 'PENDING', label: 'To give' },
  { value: 'DONE', label: 'Done' },
  { value: 'REJECTED', label: 'Rejected' },
];
const STATUS_TONE = { REQUESTED: 'accent', PENDING: 'warning', DONE: 'success', REJECTED: 'danger' } as const;
const STATUS_LABEL = { REQUESTED: 'Requested', PENDING: 'To give', DONE: 'Done', REJECTED: 'Rejected' } as const;

/** Accept an employee's request with an amount, or reject it with a reason. */
function ReviewDialog({ gift, mode, onClose }: { gift: DoctorGiftDto; mode: 'accept' | 'reject'; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const accept = useAcceptGift(onClose);
  const reject = useRejectGift(onClose);

  function submit() {
    if (mode === 'accept') {
      const rupees = Number(value);
      if (!value.trim() || !Number.isFinite(rupees) || rupees < 0) return setError('Enter the gift’s value in rupees.');
      setError(null);
      accept.mutate({ id: gift.id, body: { amountPaise: Math.round(rupees * 100) } });
    } else {
      if (!value.trim()) return setError('Say why it is rejected.');
      setError(null);
      reject.mutate({ id: gift.id, body: { reason: value.trim() } });
    }
  }

  return (
    <FormDialog
      title={mode === 'accept' ? 'Accept gift request' : 'Reject gift request'}
      description={`${gift.requestedByName ?? 'An employee'} asked for “${gift.productName}” for ${gift.doctorName || 'a doctor'}${gift.requestNote ? ` (${gift.requestNote})` : ''}.`}
      formId="gift-review-form"
      pending={accept.isPending || reject.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label={mode === 'accept' ? 'Value (₹)' : 'Reason'} htmlFor="gift-review" error={error ?? undefined}>
        <Input id="gift-review" inputMode={mode === 'accept' ? 'decimal' : undefined} value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={error ? true : undefined} />
      </FormField>
    </FormDialog>
  );
}

function GiftDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<GiftDraft>(EMPTY_GIFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const allocate = useAllocateGift(onClose);
  const set = (field: keyof GiftDraft) => (value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));
  const invalid = (field: string) => (errors[field] ? true : undefined);

  function submit() {
    const built = buildGift(draft);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    allocate.mutate(built.body);
  }

  return (
    <FormDialog
      title="Allocate a gift"
      description="The MR the doctor is assigned to sees it and marks it done once it is delivered. No approval is needed."
      formId="gift-form"
      pending={allocate.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <DoctorPickerField
        id="gift-doctor"
        value={draft.doctorId}
        onChange={set('doctorId')}
        error={errors['doctorId']}
      />
      <FormField
        label="Gift"
        htmlFor="gift-name"
        error={errors['productName']}
        hint="e.g. Desk clock"
      >
        <Input
          id="gift-name"
          value={draft.productName}
          onChange={(e) => set('productName')(e.target.value)}
          aria-invalid={invalid('productName')}
        />
      </FormField>
      <FormField label="Value (₹)" htmlFor="gift-amount" error={errors['amount']}>
        <Input
          id="gift-amount"
          inputMode="decimal"
          value={draft.amount}
          onChange={(e) => set('amount')(e.target.value)}
          aria-invalid={invalid('amount')}
        />
      </FormField>
    </FormDialog>
  );
}

/** Gifts Admin allocated to doctors, and whether the MR has delivered each. */
export function DoctorGiftsScreen() {
  const readOnly = useIsReadOnly();
  const { values, update } = useFilterParams(['status']);
  const notGiven = values.status === NOT_GIVEN;
  const status =
    values.status === 'REQUESTED' || values.status === 'PENDING' || values.status === 'DONE' || values.status === 'REJECTED' ? values.status : undefined;
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<{ gift: DoctorGiftDto; mode: 'accept' | 'reject' } | null>(null);
  const [viewing, setViewing] = useState<DoctorGiftDto | null>(null);
  const designations = useDesignations();
  const designationName = (id: string | null) => (id ? ((designations.data ?? []).find((d) => d.id === id)?.name ?? '') : '');
  const query = useDoctorGifts({ ...(status && { status }), ...(notGiven && { notGiven: true }) });
  const rows = query.data ?? [];

  const columns: readonly Column<DoctorGiftDto>[] = [
    {
      key: 'doctor',
      header: 'Doctor',
      render: (g) => <span className="font-medium">{g.doctorName || 'Unknown'}</span>,
    },
    { key: 'gift', header: 'Gift', render: (g) => g.productName },
    { key: 'value', header: 'Value', numeric: true, render: (g) => (g.status === 'REQUESTED' ? '—' : formatMoney(g.amountPaise)) },
    {
      key: 'from',
      header: 'Made by',
      render: (g) => (
        <span className="block max-w-xs truncate" title={g.requestNote ?? undefined}>
          {giftMadeByLabel(g, designationName)}
          {g.origin === 'EMPLOYEE' && g.requestNote ? ` · ${g.requestNote}` : ''}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (g) => (
        <>
          <Badge tone={STATUS_TONE[g.status]}>{STATUS_LABEL[g.status]}</Badge>
          {g.status === 'REJECTED' && g.rejectReason ? <span className="ml-2 text-sm text-muted">{g.rejectReason}</span> : null}
        </>
      ),
    },
    {
      key: 'review',
      header: '',
      render: (g) =>
        g.status === 'REQUESTED' ? (
          <span className="flex gap-2">
            <Button onClick={() => setReviewing({ gift: g, mode: 'accept' })}>Accept</Button>
            <Button onClick={() => setReviewing({ gift: g, mode: 'reject' })}>Reject</Button>
          </span>
        ) : null,
    },
    { key: 'allocated', header: 'Allocated', render: (g) => formatDate(g.allocatedAt) },
    {
      key: 'done',
      header: 'Delivered',
      render: (g) => (g.completedAt ? formatDate(g.completedAt) : '—'),
    },
    {
      key: 'view',
      header: '',
      className: 'text-right',
      render: (g) => (
        <Button size="sm" variant="secondary" onClick={() => setViewing(g)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Doctor gifts"
        description="Gifts you allocate to doctors. The assigned MR marks each one done once it is delivered."
        actions={
          <Button
            disabled={readOnly}
            title={readOnly ? 'A past financial year is read-only' : undefined}
            onClick={() => setCreating(true)}
          >
            Allocate a gift
          </Button>
        }
      />
      <div className="mb-6 w-56">
        <Select
          aria-label="Status"
          value={notGiven ? NOT_GIVEN : (status ?? ANY)}
          options={STATUS_OPTIONS}
          onValueChange={(v) => update({ status: v === ANY ? '' : v })}
        />
      </div>
      <Card flat>
        <TopProgressBar active={query.isFetching && !query.isLoading} />
        <DataState
          isLoading={query.isLoading}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={rows.length === 0}
          empty={{
            title: 'No gifts',
            description: status
              ? 'No gift has this status.'
              : 'Allocate a gift to a doctor to start.',
          }}
        >
          <DataTable columns={columns} rows={rows} rowKey={(g) => g.id} onRowClick={setViewing} />
        </DataState>
      </Card>
      {viewing ? <GiftDetailDialog gift={viewing} madeBy={giftMadeByLabel(viewing, designationName)} onClose={() => setViewing(null)} /> : null}
      {creating ? <GiftDialog onClose={() => setCreating(false)} /> : null}
      {reviewing ? <ReviewDialog gift={reviewing.gift} mode={reviewing.mode} onClose={() => setReviewing(null)} /> : null}
    </>
  );
}
