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
import { DoctorPickerField } from '@/features/field-master-data/components/DoctorPickerField';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate, formatMoney } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAllocateGift, useDoctorGifts } from '../hooks/useDoctorSpend';
import { buildGift, EMPTY_GIFT, type GiftDraft } from '../lib/doctorSpend';

const ANY = 'all';
const STATUS_OPTIONS = [
  { value: ANY, label: 'Pending and done' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'DONE', label: 'Done' },
];

function GiftDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<GiftDraft>(EMPTY_GIFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const allocate = useAllocateGift(onClose);
  const set = (field: keyof GiftDraft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));
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
      <DoctorPickerField id="gift-doctor" value={draft.doctorId} onChange={set('doctorId')} error={errors['doctorId']} />
      <FormField label="Gift" htmlFor="gift-name" error={errors['productName']} hint="e.g. Desk clock">
        <Input id="gift-name" value={draft.productName} onChange={(e) => set('productName')(e.target.value)} aria-invalid={invalid('productName')} />
      </FormField>
      <FormField label="Value (₹)" htmlFor="gift-amount" error={errors['amount']}>
        <Input id="gift-amount" inputMode="decimal" value={draft.amount} onChange={(e) => set('amount')(e.target.value)} aria-invalid={invalid('amount')} />
      </FormField>
    </FormDialog>
  );
}

/** Gifts Admin allocated to doctors, and whether the MR has delivered each. */
export function DoctorGiftsScreen() {
  const readOnly = useIsReadOnly();
  const { values, update } = useFilterParams(['status']);
  const status = values.status === 'PENDING' || values.status === 'DONE' ? values.status : undefined;
  const [creating, setCreating] = useState(false);
  const query = useDoctorGifts({ ...(status && { status }) });
  const rows = query.data ?? [];

  const columns: readonly Column<DoctorGiftDto>[] = [
    { key: 'doctor', header: 'Doctor', render: (g) => <span className="font-medium">{g.doctorName || 'Unknown'}</span> },
    { key: 'gift', header: 'Gift', render: (g) => g.productName },
    { key: 'value', header: 'Value', numeric: true, render: (g) => formatMoney(g.amountPaise) },
    { key: 'status', header: 'Status', render: (g) => <Badge tone={g.status === 'DONE' ? 'success' : 'warning'}>{g.status === 'DONE' ? 'Done' : 'Pending'}</Badge> },
    { key: 'allocated', header: 'Allocated', render: (g) => formatDate(g.allocatedAt) },
    { key: 'done', header: 'Delivered', render: (g) => (g.completedAt ? formatDate(g.completedAt) : '—') },
  ];

  return (
    <>
      <PageHeader
        title="Doctor gifts"
        description="Gifts you allocate to doctors. The assigned MR marks each one done once it is delivered."
        actions={
          <Button disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setCreating(true)}>
            Allocate a gift
          </Button>
        }
      />
      <div className="mb-6 w-56">
        <Select aria-label="Status" value={status ?? ANY} options={STATUS_OPTIONS} onValueChange={(v) => update({ status: v === ANY ? '' : v })} />
      </div>
      <Card>
        <TopProgressBar active={query.isFetching && !query.isLoading} />
        <DataState
          isLoading={query.isLoading}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={rows.length === 0}
          empty={{ title: 'No gifts', description: status ? 'No gift has this status.' : 'Allocate a gift to a doctor to start.' }}
        >
          <DataTable columns={columns} rows={rows} rowKey={(g) => g.id} />
        </DataState>
      </Card>
      {creating ? <GiftDialog onClose={() => setCreating(false)} /> : null}
    </>
  );
}
