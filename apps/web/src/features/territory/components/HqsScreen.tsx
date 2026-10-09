'use client';

import type { HqDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useHqs } from '../hooks/useHqs';
import { useZoneOptions } from '../hooks/useParentOptions';
import { useUpdateHq } from '../hooks/useTerritoryMutations';
import { HqFormDialog } from './HqFormDialog';
import { RowActions } from '@/components/ui/RowActions';
import { StatusFilter } from '@/components/ui/StatusFilter';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { PagedListFrame } from '@/components/ui/PagedListFrame';

export function HqsScreen() {
  const { values, page, pageSize, update } = useFilterParams(['search', 'status', 'zoneId']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const zones = useZoneOptions();
  const [form, setForm] = useState<{ hq?: HqDto } | null>(null);
  const [toggling, setToggling] = useState<HqDto | null>(null);
  const updateHq = useUpdateHq(() => setToggling(null));

  const hqs = useHqs({
    page,
    pageSize,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as HqDto['status'] }),
    ...(values.zoneId && { zoneId: values.zoneId }),
  });

  const columns: readonly Column<HqDto>[] = [
    { key: 'name', header: 'HQ', render: (h) => <span className="font-medium">{h.name}</span> },
    { key: 'zone', header: 'Zone', render: (h) => zones.nameOf.get(h.zoneId) ?? '—' },
    {
      key: 'base',
      header: 'Base place',
      render: (h) => h.basePlace?.label ?? <Badge tone="danger">Not set</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (h) => <Badge tone={h.status === 'active' ? 'success' : 'neutral'}>{h.status === 'active' ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (h) => (
        <RowActions label={h.name} status={h.status} disabled={readOnly} onEdit={() => setForm({ hq: h })} onToggleStatus={() => setToggling(h)} />
      ),
    },
  ];

  return (
    <PagedListFrame
      title="HQs"
      description="Headquarters, each under one zone, with the base place its routes start from."
      noun="HQ"
      readOnly={readOnly}
      onNew={() => setForm({})}
      filters={
        <>
          <Input placeholder="Search HQs" aria-label="Search HQs" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="w-52">
            <Select
              aria-label="Zone"
              value={values.zoneId || 'all'}
              onValueChange={(v) => update({ zoneId: v === 'all' ? '' : v })}
              options={[{ value: 'all', label: 'All zones' }, ...zones.options]}
            />
          </div>
          <StatusFilter value={values.status} onChange={(v) => update({ status: v })} />
        </>
      }
      query={hqs}
      columns={columns}
      emptyDescription="No HQ matches these filters."
      onPageChange={(p) => update({ page: p })}
      pageSize={pageSize}
      onPageSizeChange={(n) => update({ pageSize: n })}
    >
      {form ? <HqFormDialog hq={form.hq} onClose={() => setForm(null)} /> : null}
      <StatusToggleDialog
        item={toggling}
        noun="HQ"
        pending={updateHq.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) => toggling && updateHq.mutate({ id: toggling.id, body: { status } })}
      />
    </PagedListFrame>
  );
}
