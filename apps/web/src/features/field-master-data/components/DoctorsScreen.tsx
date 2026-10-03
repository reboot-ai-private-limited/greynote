'use client';

import type { DoctorDto, DoctorStatus } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { RowActions } from '@/components/ui/RowActions';
import { Select } from '@/components/ui/Select';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useDoctorCategories, useDoctors, useUpdateDoctor } from '../hooks/useDoctors';
import { DOCTOR_STATUS_LABEL, DOCTOR_STATUS_TONE, canToggleStatus } from '../lib/doctors';
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
  const { values, page, update } = useFilterParams(['search', 'status', 'routeId', 'category']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const directory = useTerritoryDirectory();
  const { categories } = useDoctorCategories();
  const [toggling, setToggling] = useState<DoctorDto | null>(null);
  const updateDoctor = useUpdateDoctor(() => setToggling(null));

  const doctors = useDoctors({
    page,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as DoctorStatus }),
    ...(values.routeId && { routeId: values.routeId }),
    ...(values.category && { category: values.category }),
  });

  const columns: readonly Column<DoctorDto>[] = [
    {
      key: 'name',
      header: 'Doctor',
      render: (d) => (
        <div>
          <Link href={`/doctors/${d.id}`} className="font-medium text-text hover:text-accent hover:underline">
            {d.name}
          </Link>
          <div className="text-xs text-text-subtle">{d.specialty}</div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (d) => d.category },
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
        canToggleStatus(d.status) ? (
          <RowActions
            label={d.name}
            status={d.status === 'active' ? 'active' : 'inactive'}
            disabled={readOnly}
            onEdit={() => router.push(`/doctors/${d.id}`)}
            onToggleStatus={() => setToggling(d)}
          />
        ) : null,
    },
  ];

  return (
    <PagedListFrame
      title="Doctors"
      description="Doctors on a route, and the MR responsible for each. A doctor an MR adds waits for approval before anyone can visit it."
      noun="doctor"
      readOnly={readOnly}
      onNew={() => router.push('/doctors/new')}
      filters={
        <>
          <Input placeholder="Search by name" aria-label="Search doctors" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <RouteFilter value={values.routeId} onChange={(v) => update({ routeId: v })} />
          <div className="w-40">
            <Select
              aria-label="Category"
              value={values.category || ANY}
              options={[{ value: ANY, label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]}
              onValueChange={(v) => update({ category: v === ANY ? '' : v })}
            />
          </div>
          <div className="w-48">
            <Select aria-label="Status" value={values.status || ANY} options={STATUS_OPTIONS} onValueChange={(v) => update({ status: v === ANY ? '' : v })} />
          </div>
        </>
      }
      query={doctors}
      columns={columns}
      emptyDescription="No doctor matches these filters."
      onPageChange={(p) => update({ page: p })}
    >
      <StatusToggleDialog
        item={toggling ? { id: toggling.id, name: toggling.name, status: toggling.status === 'active' ? 'active' : 'inactive' } : null}
        noun="doctor"
        pending={updateDoctor.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) => toggling && updateDoctor.mutate({ id: toggling.id, body: { status } })}
      />
    </PagedListFrame>
  );
}
