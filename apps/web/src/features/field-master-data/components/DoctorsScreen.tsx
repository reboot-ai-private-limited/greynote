'use client';

import type { DoctorDto, DoctorStatus } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/features/people/components/Avatar';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { RowActions, RowMenu } from '@/components/ui/RowActions';
import { Select } from '@/components/ui/Select';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/allPages';
import { doctorsApi, type ListDoctorsQuery } from '@/lib/api/endpoints/fieldMasterData';
import { useCsvExport } from '@/lib/hooks/useCsvExport';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useDoctors, useUpdateDoctor } from '../hooks/useDoctors';
import { DOCTOR_STATUS_LABEL, DOCTOR_STATUS_TONE, canToggleStatus, pendingApprovalHref } from '../lib/doctors';
import { doctorsCsv, doctorsFilename } from '../lib/doctorsCsv';
import { RetireDoctorDialog } from './RetireDoctorDialog';
import { RouteFilter } from './RoutePickerField';

const ANY = 'all';
const STATUS_OPTIONS = [
  { value: ANY, label: 'All statuses' },
  { value: 'pending', label: DOCTOR_STATUS_LABEL.pending },
  { value: 'active', label: DOCTOR_STATUS_LABEL.active },
  { value: 'inactive', label: DOCTOR_STATUS_LABEL.inactive },
];

export function DoctorsScreen() {
  const router = useRouter();
  const { values, page, pageSize, update } = useFilterParams(['search', 'status', 'routeId']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const directory = useTerritoryDirectory();
  // Reactivating is a plain confirm; deactivating and deleting first show what they touch.
  const [toggling, setToggling] = useState<DoctorDto | null>(null);
  const [retiring, setRetiring] = useState<{ action: 'deactivate' | 'delete'; doctor: DoctorDto } | null>(null);
  const updateDoctor = useUpdateDoctor(() => setToggling(null));

  const filters: Pick<ListDoctorsQuery, 'search' | 'status' | 'routeId'> = {
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as DoctorStatus }),
    ...(values.routeId && { routeId: values.routeId }),
  };
  const doctors = useDoctors({ page, pageSize, ...filters });
  // Every doctor matching the filters, not just this page. 100 pages of 100 is the ceiling.
  const download = useCsvExport(async (token) => {
    const { items, complete } = await fetchAllPages((p) => doctorsApi.list(token, { page: p, pageSize: MAX_PAGE_SIZE, ...filters }), 100);
    return { filename: doctorsFilename(), csv: doctorsCsv(items, directory.routeLabel), complete };
  });

  const columns: readonly Column<DoctorDto>[] = [
    {
      key: 'name',
      header: 'Doctor',
      render: (d) => (
        <div className="flex items-center gap-3">
          <Avatar name={d.name} url={d.photoUrl} />
          <div>
            <Link href={`/doctors/${d.id}`} className="font-medium text-text hover:text-accent hover:underline">
              {d.name}
            </Link>
            <div className="text-xs text-text-subtle">{d.specialty}</div>
          </div>
        </div>
      ),
    },
    { key: 'specialty', header: 'Speciality', render: (d) => d.specialty },
    { key: 'route', header: 'Route', render: (d) => directory.routeLabel(d.routeId) },
    {
      key: 'mr',
      header: 'Responsible MR',
      render: (d) =>
        d.assignedTo ? (
          `${d.assignedTo.name} (${d.assignedTo.employeeCode})`
        ) : d.status === 'pending' ? (
          <span className="text-text-subtle">—</span>
        ) : (
          <Badge tone="warning">Unassigned</Badge>
        ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (d) => (d.location ? <Badge tone="success">Set</Badge> : <Badge tone="warning">Not set</Badge>),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => <Badge tone={DOCTOR_STATUS_TONE[d.status]}>{DOCTOR_STATUS_LABEL[d.status]}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (d) =>
        !canToggleStatus(d.status) ? (
          // Waiting for approval: the approval decides whether it exists, so no deactivate or delete here.
          <RowMenu
            label={d.name}
            disabled={readOnly}
            items={[
              { label: 'Review details', onSelect: () => router.push(`/doctors/${d.id}`) },
              { label: 'Approve or reject', onSelect: () => router.push(pendingApprovalHref(d)) },
            ]}
          />
        ) : (
          <RowActions
            label={d.name}
            status={d.status === 'active' ? 'active' : 'inactive'}
            disabled={readOnly}
            onEdit={() => router.push(`/doctors/${d.id}`)}
            onToggleStatus={() => (d.status === 'active' ? setRetiring({ action: 'deactivate', doctor: d }) : setToggling(d))}
            onDelete={() => setRetiring({ action: 'delete', doctor: d })}
          />
        ),
    },
  ];

  return (
    <PagedListFrame
      title="Doctors"
      description="Doctors on a route, and the MR responsible for each. A doctor an MR adds waits for approval before anyone can visit it."
      noun="doctor"
      readOnly={readOnly}
      onNew={() => router.push('/doctors/new')}
      actions={
        <Button variant="secondary" disabled={download.isPending} onClick={() => download.mutate()}>
          {download.isPending ? 'Preparing…' : 'Download CSV'}
        </Button>
      }
      filters={
        <>
          <Input placeholder="Search by name" aria-label="Search doctors" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <RouteFilter value={values.routeId} onChange={(v) => update({ routeId: v })} />
          <div className="w-48">
            <Select aria-label="Status" value={values.status || ANY} options={STATUS_OPTIONS} onValueChange={(v) => update({ status: v === ANY ? '' : v })} />
          </div>
        </>
      }
      query={doctors}
      columns={columns}
      emptyDescription="No doctor matches these filters."
      onPageChange={(p) => update({ page: p })}
      pageSize={pageSize}
      onPageSizeChange={(n) => update({ pageSize: n })}
    >
      <StatusToggleDialog
        item={toggling ? { id: toggling.id, name: toggling.name, status: toggling.status === 'active' ? 'active' : 'inactive' } : null}
        noun="doctor"
        pending={updateDoctor.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) => toggling && updateDoctor.mutate({ id: toggling.id, body: { status } })}
      />
      {retiring ? <RetireDoctorDialog action={retiring.action} doctor={retiring.doctor} onClose={() => setRetiring(null)} /> : null}
    </PagedListFrame>
  );
}
