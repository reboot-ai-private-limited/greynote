'use client';

import { DOCTOR_SERVICE_TYPES, type DoctorServiceDto } from '@greynote/contracts';
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
import { serviceOriginLabel, serviceTypeLabel } from '@/features/approvals/lib/previews';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate, formatMoney } from '@/lib/format';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useSession } from '@/lib/auth/SessionProvider';
import { useCreateDoctorService, useDoctorServices, useMarkServiceDone } from '../hooks/useDoctorSpend';
import { buildService, EMPTY_SERVICE, type ServiceDraft } from '../lib/doctorSpend';

const TYPE_OPTIONS = DOCTOR_SERVICE_TYPES.map((t) => ({ value: t, label: serviceTypeLabel(t) }));

function ServiceDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<ServiceDraft>(EMPTY_SERVICE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateDoctorService(onClose);
  const set = (field: keyof ServiceDraft) => (value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));
  const invalid = (field: string) => (errors[field] ? true : undefined);

  function submit() {
    const built = buildService(draft);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title="New doctor service"
      description="Takes effect at once, for the MR the doctor is assigned to. A doctor with no MR cannot be given one."
      formId="service-form"
      pending={create.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <DoctorPickerField
        id="service-doctor"
        value={draft.doctorId}
        onChange={set('doctorId')}
        error={errors['doctorId']}
      />
      <FormField label="Type" htmlFor="service-type" error={errors['serviceType']}>
        <Select
          id="service-type"
          value={draft.serviceType}
          onValueChange={set('serviceType')}
          options={TYPE_OPTIONS}
          placeholder="Choose a type"
          aria-invalid={invalid('serviceType')}
        />
      </FormField>
      <FormField label="Amount (₹)" htmlFor="service-amount" error={errors['amount']}>
        <Input
          id="service-amount"
          inputMode="decimal"
          value={draft.amount}
          onChange={(e) => set('amount')(e.target.value)}
          aria-invalid={invalid('amount')}
        />
      </FormField>
      <FormField
        label="Remarks"
        htmlFor="service-remarks"
        error={errors['remarks']}
        hint="Optional."
      >
        <Input
          id="service-remarks"
          value={draft.remarks}
          onChange={(e) => set('remarks')(e.target.value)}
          aria-invalid={invalid('remarks')}
        />
      </FormField>
    </FormDialog>
  );
}

/** Every Doctor Service: the ones MRs asked for (with where each is in its approval) and the ones Admin recorded. */
export function DoctorServicesScreen() {
  const readOnly = useIsReadOnly();
  const [creating, setCreating] = useState(false);
  const query = useDoctorServices({});
  const rows = query.data ?? [];
  const { user: me } = useSession();
  const isAdmin = me?.role === 'ADMIN';
  const markDone = useMarkServiceDone();

  const columns: readonly Column<DoctorServiceDto>[] = [
    {
      key: 'doctor',
      header: 'Doctor',
      render: (s) => <span className="font-medium">{s.doctorName || 'Unknown'}</span>,
    },
    { key: 'type', header: 'Service', render: (s) => serviceTypeLabel(s.serviceType) },
    { key: 'amount', header: 'Amount', numeric: true, render: (s) => formatMoney(s.amountPaise) },
    { key: 'origin', header: 'Made by', render: (s) => serviceOriginLabel(s.origin) },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        s.doneAt ? (
          <Badge tone="success">Done</Badge>
        ) : (
          <Badge tone={s.status === 'APPROVED' ? 'accent' : s.status === 'REJECTED' ? 'danger' : 'warning'}>
            {s.status === 'APPROVED' ? 'Approved, to do' : s.status.replace(/_/g, ' ').toLowerCase()}
          </Badge>
        )
      ),
    },
    { key: 'remarks', header: 'Remarks', render: (s) => s.remarks ?? '—' },
    { key: 'date', header: 'Date', render: (s) => formatDate(s.createdAt) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (s) =>
        s.awaitingDone ? (
          <Button size="sm" disabled={readOnly || markDone.isPending} onClick={() => markDone.mutate(s.id)}>
            Mark done
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="Doctor services"
        description="Tour packages, gifts, online promotion and others given to doctors. An MR's request waits for approval; one Admin records is approved at once. Once approved, Admin or Accounts marks it done."
        actions={
          isAdmin ? (
            <Button
              disabled={readOnly}
              title={readOnly ? 'A past financial year is read-only' : undefined}
              onClick={() => setCreating(true)}
            >
              New service
            </Button>
          ) : undefined
        }
      />
      <Card flat>
        <TopProgressBar active={query.isFetching && !query.isLoading} />
        <DataState
          isLoading={query.isLoading}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={rows.length === 0}
          empty={{
            title: 'No doctor services yet',
            description: 'Services appear here when an MR asks for one, or when you record one.',
          }}
        >
          <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} />
        </DataState>
      </Card>
      {creating ? <ServiceDialog onClose={() => setCreating(false)} /> : null}
    </>
  );
}
