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
import { useDesignations } from '@/features/people/hooks/useMasterData';
import { DoctorPickerField } from '@/features/field-master-data/components/DoctorPickerField';
import { serviceTypeLabel } from '@/features/approvals/lib/previews';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate, formatMoney } from '@/lib/format';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useSession } from '@/lib/auth/SessionProvider';
import { withAuth } from '@/lib/auth/session';
import { downloadBlob } from '@/lib/download';
import { fieldActivityApi } from '@/lib/api/endpoints/fieldActivity';
import { useCreateDoctorService, useDoctorServices, useMarkServiceDone } from '../hooks/useDoctorSpend';
import { buildService, EMPTY_SERVICE, type ServiceDraft } from '../lib/doctorSpend';
import { madeByLabel, ServiceDetailDialog, serviceStatusText } from './ServiceDetailDialog';
import { totalServices, type DoctorTotalsRow } from '../lib/serviceTotals';

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
  const [viewing, setViewing] = useState<DoctorServiceDto | null>(null);
  const designations = useDesignations();
  const designationName = (id: string | null) => (id ? ((designations.data ?? []).find((d) => d.id === id)?.name ?? '') : '');
  // Requests, or one row per doctor with totals (decision-log 2026-11-19).
  const [view, setView] = useState<'requests' | 'doctors'>('requests');
  const money = totalServices(rows);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const download = async () => {
    setFileBusy(true);
    setFileError(null);
    try {
      downloadBlob('GREYNOTE DOCTOR SERVICES.xlsx', await withAuth((token) => fieldActivityApi.doctorServicesReport(token, {})));
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Could not make the file. Try again.');
    } finally {
      setFileBusy(false);
    }
  };
  const doctorColumns: readonly Column<DoctorTotalsRow>[] = [
    { key: 'doctor', header: 'Doctor', render: (d) => <span className="font-medium">{d.doctorName}</span> },
    { key: 'requests', header: 'Requests', numeric: true, render: (d) => d.requests },
    { key: 'approved', header: 'Approved', numeric: true, render: (d) => formatMoney(d.approvedPaise) },
    { key: 'waiting', header: 'Waiting', numeric: true, render: (d) => formatMoney(d.waitingPaise) },
    { key: 'done', header: 'Carried out', numeric: true, render: (d) => formatMoney(d.donePaise) },
  ];

  const columns: readonly Column<DoctorServiceDto>[] = [
    {
      key: 'doctor',
      header: 'Doctor',
      render: (s) => <span className="font-medium">{s.doctorName || 'Unknown'}</span>,
    },
    { key: 'type', header: 'Service', render: (s) => serviceTypeLabel(s.serviceType) },
    { key: 'amount', header: 'Amount', numeric: true, render: (s) => formatMoney(s.amountPaise) },
    { key: 'origin', header: 'Made by', render: (s) => madeByLabel(s, designationName) },
    {
      key: 'status',
      header: 'Status',
      render: (s) => (
        s.doneAt ? (
          <Badge tone="success">Done</Badge>
        ) : (
          <Badge tone={s.status === 'APPROVED' ? 'accent' : s.status === 'REJECTED' ? 'danger' : 'warning'}>
            {serviceStatusText(s)}
          </Badge>
        )
      ),
    },
    { key: 'remarks', header: 'Remarks', render: (s) => <span className="block max-w-xs truncate" title={s.remarks ?? undefined}>{s.remarks ?? '—'}</span> },
    { key: 'date', header: 'Date', render: (s) => formatDate(s.createdAt) },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (s) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => setViewing(s)}>
            View
          </Button>
          {isAdmin && s.awaitingDone ? (
            <Button size="sm" disabled={readOnly || markDone.isPending} onClick={() => markDone.mutate(s.id)}>
              Mark done
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Doctor services"
        description="Honorarium, CME, training, online promotion and others given to doctors. An MR's request waits for approval; one Admin records is approved at once. Once approved, Admin marks it done."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={fileBusy || rows.length === 0} onClick={() => void download()}>
              {fileBusy ? 'Making the file…' : 'Download Excel'}
            </Button>
            {isAdmin ? (
              <Button disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setCreating(true)}>
                New service
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          ['Approved', formatMoney(money.totals.approvedPaise)],
          ['Waiting', formatMoney(money.totals.waitingPaise)],
          ['Carried out', formatMoney(money.totals.donePaise)],
          ['Requests', String(money.totals.requests)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-surface px-4 py-3">
            <p className="text-xs text-text-subtle">{label}</p>
            <p className="text-lg font-semibold tabular-nums text-text">{value}</p>
          </div>
        ))}
      </div>
      {fileError ? <p className="mb-3 text-sm text-danger">{fileError}</p> : null}
      <div className="mb-3 flex gap-2">
        <Button size="sm" variant={view === 'requests' ? 'primary' : 'secondary'} onClick={() => setView('requests')}>
          Requests
        </Button>
        <Button size="sm" variant={view === 'doctors' ? 'primary' : 'secondary'} onClick={() => setView('doctors')}>
          By doctor
        </Button>
      </div>
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
          {view === 'doctors' ? <DataTable columns={doctorColumns} rows={money.doctors} rowKey={(d) => d.doctorId} /> : <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} onRowClick={setViewing} />}
        </DataState>
      </Card>
      {viewing ? (
        <ServiceDetailDialog
          service={viewing}
          madeBy={madeByLabel(viewing, designationName)}
          canMarkDone={isAdmin && viewing.awaitingDone && !readOnly}
          marking={markDone.isPending}
          onMarkDone={() => markDone.mutate(viewing.id, { onSuccess: () => setViewing(null) })}
          onClose={() => setViewing(null)}
        />
      ) : null}
      {creating ? <ServiceDialog onClose={() => setCreating(false)} /> : null}
    </>
  );
}
