'use client';

import type { DistributorDto, MasterStatus } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { RowActions } from '@/components/ui/RowActions';
import { Select } from '@/components/ui/Select';
import { StatusFilter } from '@/components/ui/StatusFilter';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useDistributors, useUpdateDistributor } from '../hooks/useDistributors';
import { EmployeeFilter, EmployeeName } from '@/features/people/components/EmployeePickerField';
import { RouteFilter } from './RoutePickerField';

const ANY = 'all';

export function DistributorsScreen() {
  const router = useRouter();
  const { values, page, update } = useFilterParams(['search', 'status', 'routeId', 'hqId', 'zoneId', 'assignedMrId']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const directory = useTerritoryDirectory();
  const [toggling, setToggling] = useState<DistributorDto | null>(null);
  const updateDistributor = useUpdateDistributor(() => setToggling(null));

  const distributors = useDistributors({
    page,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as MasterStatus }),
    ...(values.routeId && { routeId: values.routeId }),
    ...(values.hqId && { hqId: values.hqId }),
    ...(values.zoneId && { zoneId: values.zoneId }),
    ...(values.assignedMrId && { assignedMrId: values.assignedMrId }),
  });

  const columns: readonly Column<DistributorDto>[] = [
    {
      key: 'name',
      header: 'Distributor',
      render: (d) => (
        <div>
          <Link href={`/distributors/${d.id}`} className="font-medium text-text hover:text-accent hover:underline">
            {d.name}
          </Link>
          <div className="text-xs text-text-subtle tabular-nums">{d.gstNumber}</div>
        </div>
      ),
    },
    { key: 'route', header: 'Route', render: (d) => directory.routeLabel(d.routeId) },
    { key: 'mr', header: 'MR', render: (d) => <EmployeeName userId={d.assignedMrId} /> },
    {
      key: 'sales',
      header: 'Takes orders',
      render: (d) =>
        d.primarySalesEnabled || d.secondarySalesEnabled
          ? [d.primarySalesEnabled && 'Primary', d.secondarySalesEnabled && 'Secondary'].filter(Boolean).join(' · ')
          : <span className="text-text-subtle">None</span>,
    },
    {
      key: 'location',
      header: 'Location',
      render: (d) => (d.location ? <Badge tone="success">Set</Badge> : <Badge tone="warning">Not set</Badge>),
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) => <Badge tone={d.status === 'active' ? 'success' : 'neutral'}>{d.status === 'active' ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (d) => (
        <RowActions
          label={d.name}
          status={d.status}
          disabled={readOnly}
          onEdit={() => router.push(`/distributors/${d.id}`)}
          onToggleStatus={() => setToggling(d)}
        />
      ),
    },
  ];

  return (
    <PagedListFrame
      title="Distributors"
      description="Stockists on a route, with an MR and an ASM assigned. Orders and monthly stock are taken against them."
      noun="distributor"
      readOnly={readOnly}
      onNew={() => router.push('/distributors/new')}
      filters={
        <>
          <Input placeholder="Search by name" aria-label="Search distributors" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="w-44">
            <Select
              aria-label="Zone"
              value={values.zoneId || ANY}
              options={[{ value: ANY, label: 'All zones' }, ...directory.zoneOptions]}
              onValueChange={(v) => update({ zoneId: v === ANY ? '' : v })}
            />
          </div>
          <div className="w-52">
            <Select
              aria-label="HQ"
              value={values.hqId || ANY}
              options={[{ value: ANY, label: 'All HQs' }, ...directory.hqOptions]}
              onValueChange={(v) => update({ hqId: v === ANY ? '' : v })}
            />
          </div>
          <RouteFilter value={values.routeId} onChange={(v) => update({ routeId: v })} />
          <EmployeeFilter allLabel="Any MR" value={values.assignedMrId} onChange={(v) => update({ assignedMrId: v })} />
          <StatusFilter value={values.status} onChange={(v) => update({ status: v })} />
        </>
      }
      query={distributors}
      columns={columns}
      emptyDescription="No distributor matches these filters."
      onPageChange={(p) => update({ page: p })}
    >
      <StatusToggleDialog
        item={toggling}
        noun="distributor"
        pending={updateDistributor.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) => toggling && updateDistributor.mutate({ id: toggling.id, body: { status } })}
      />
    </PagedListFrame>
  );
}
