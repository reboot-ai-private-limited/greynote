'use client';

import type { ZoneDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useZones } from '../hooks/useZones';
import { useUpdateZone } from '../hooks/useTerritoryMutations';
import { RowActions } from '@/components/ui/RowActions';
import { StatusFilter } from '@/components/ui/StatusFilter';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { ZoneFormDialog } from './ZoneFormDialog';

export function ZonesScreen() {
  const { values, page, pageSize, update } = useFilterParams(['search', 'status']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const [form, setForm] = useState<{ zone?: ZoneDto } | null>(null);
  const [toggling, setToggling] = useState<ZoneDto | null>(null);
  const updateZone = useUpdateZone(() => setToggling(null));

  const zones = useZones({
    page,
    pageSize,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as ZoneDto['status'] }),
  });

  const columns: readonly Column<ZoneDto>[] = [
    { key: 'name', header: 'Zone', render: (z) => <span className="font-medium">{z.name}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (z) => <Badge tone={z.status === 'active' ? 'success' : 'neutral'}>{z.status === 'active' ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (z) => (
        <RowActions
          label={z.name}
          status={z.status}
          disabled={readOnly}
          onEdit={() => setForm({ zone: z })}
          onToggleStatus={() => setToggling(z)}
        />
      ),
    },
  ];

  return (
    <PagedListFrame
      title="Zones"
      description="Top of the territory hierarchy."
      noun="zone"
      readOnly={readOnly}
      onNew={() => setForm({})}
      filters={
        <>
          <Input placeholder="Search zones" aria-label="Search zones" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <StatusFilter value={values.status} onChange={(v) => update({ status: v })} />
        </>
      }
      query={zones}
      columns={columns}
      emptyDescription="No zone matches these filters."
      onPageChange={(p) => update({ page: p })}
      pageSize={pageSize}
      onPageSizeChange={(n) => update({ pageSize: n })}
    >
      {form ? <ZoneFormDialog zone={form.zone} onClose={() => setForm(null)} /> : null}
      <StatusToggleDialog
        item={toggling}
        noun="zone"
        pending={updateZone.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) => toggling && updateZone.mutate({ id: toggling.id, body: { status } })}
      />
    </PagedListFrame>
  );
}
