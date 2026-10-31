'use client';

import type { ChemistDto, ChemistStatus } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { RowActions, RowMenu } from '@/components/ui/RowActions';
import { Select } from '@/components/ui/Select';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useChemists, useUpdateChemist } from '../hooks/useChemists';
import { CHEMIST_STATUS_LABEL, CHEMIST_STATUS_TONE, PENDING_CHEMIST_APPROVALS_HREF } from '../lib/chemists';
import { RouteFilter } from './RoutePickerField';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: CHEMIST_STATUS_LABEL.pending },
  { value: 'active', label: CHEMIST_STATUS_LABEL.active },
  { value: 'inactive', label: CHEMIST_STATUS_LABEL.inactive },
];

export function ChemistsScreen() {
  const router = useRouter();
  const { values, page, pageSize, update } = useFilterParams(['search', 'status', 'routeId']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const directory = useTerritoryDirectory();
  const [toggling, setToggling] = useState<(ChemistDto & { status: 'active' | 'inactive' }) | null>(null);
  const updateChemist = useUpdateChemist(() => setToggling(null));

  const chemists = useChemists({
    page,
    pageSize,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as ChemistStatus }),
    ...(values.routeId && { routeId: values.routeId }),
  });

  const columns: readonly Column<ChemistDto>[] = [
    {
      key: 'name',
      header: 'Chemist',
      render: (c) => (
        <Link href={`/chemists/${c.id}`} className="font-medium text-text hover:text-accent hover:underline">
          {c.name}
        </Link>
      ),
    },
    { key: 'route', header: 'Route', render: (c) => directory.routeLabel(c.routeId) },
    { key: 'address', header: 'Address', render: (c) => <span className="line-clamp-1 max-w-xs">{c.address}</span> },
    {
      key: 'location',
      header: 'Location',
      render: (c) => (c.location ? <Badge tone="success">Set</Badge> : <Badge tone="warning">Not set</Badge>),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <Badge tone={CHEMIST_STATUS_TONE[c.status]}>{CHEMIST_STATUS_LABEL[c.status]}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (c) =>
        c.status === 'pending' ? (
          // Waiting for approval: the approval decides whether it exists, so no deactivate here.
          <RowMenu
            label={c.name}
            disabled={readOnly}
            items={[
              { label: 'Review details', onSelect: () => router.push(`/chemists/${c.id}`) },
              { label: 'Approve or reject', onSelect: () => router.push(PENDING_CHEMIST_APPROVALS_HREF) },
            ]}
          />
        ) : (
          <RowActions
            label={c.name}
            status={c.status}
            disabled={readOnly}
            onEdit={() => router.push(`/chemists/${c.id}`)}
            onToggleStatus={() => setToggling({ ...c, status: c.status === 'active' ? 'active' : 'inactive' })}
          />
        ),
    },
  ];

  return (
    <PagedListFrame
      title="Chemists"
      description="Pharmacies on a route. A chemist without a location can't be checked by the geofence."
      noun="chemist"
      readOnly={readOnly}
      onNew={() => router.push('/chemists/new')}
      filters={
        <>
          <Input placeholder="Search by name" aria-label="Search chemists" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <RouteFilter value={values.routeId} onChange={(v) => update({ routeId: v })} />
          <div className="w-44">
            <Select
              aria-label="Status"
              value={values.status || 'all'}
              onValueChange={(v) => update({ status: v === 'all' ? '' : v })}
              options={STATUS_OPTIONS}
            />
          </div>
        </>
      }
      query={chemists}
      columns={columns}
      emptyDescription="No chemist matches these filters."
      onPageChange={(p) => update({ page: p })}
      pageSize={pageSize}
      onPageSizeChange={(n) => update({ pageSize: n })}
    >
      <StatusToggleDialog
        item={toggling}
        noun="chemist"
        pending={updateChemist.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) => toggling && updateChemist.mutate({ id: toggling.id, body: { status } })}
      />
    </PagedListFrame>
  );
}
