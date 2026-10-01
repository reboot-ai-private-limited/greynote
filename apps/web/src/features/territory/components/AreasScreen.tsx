'use client';

import type { AreaDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAreas } from '../hooks/useAreas';
import { useHqOptions } from '../hooks/useParentOptions';
import { useUpdateArea } from '../hooks/useTerritoryMutations';
import { AREA_TYPE_LABEL } from '../lib/draft';
import { AREA_TYPE_OPTIONS, AreaFormDialog } from './AreaFormDialog';
import { RowActions } from './RowActions';
import { StatusFilter } from './StatusFilter';
import { StatusToggleDialog } from './StatusToggleDialog';
import { TerritoryLevelFrame } from './TerritoryLevelFrame';

export function AreasScreen() {
  const { values, page, update } = useFilterParams(['search', 'status', 'hqId', 'type']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const hqs = useHqOptions();
  const [form, setForm] = useState<{ area?: AreaDto } | null>(null);
  const [toggling, setToggling] = useState<AreaDto | null>(null);
  const updateArea = useUpdateArea(() => setToggling(null));

  const areas = useAreas({
    page,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as AreaDto['status'] }),
    ...(values.hqId && { hqId: values.hqId }),
    ...(values.type && { type: values.type as AreaDto['type'] }),
  });

  const columns: readonly Column<AreaDto>[] = [
    { key: 'name', header: 'Area', render: (a) => <span className="font-medium">{a.name}</span> },
    { key: 'hq', header: 'HQ', render: (a) => hqs.nameOf.get(a.hqId) ?? '—' },
    { key: 'type', header: 'Type', render: (a) => <Badge tone="accent">{AREA_TYPE_LABEL[a.type]}</Badge> },
    {
      key: 'status',
      header: 'Status',
      render: (a) => <Badge tone={a.status === 'active' ? 'success' : 'neutral'}>{a.status === 'active' ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (a) => (
        <RowActions label={a.name} status={a.status} disabled={readOnly} onEdit={() => setForm({ area: a })} onToggleStatus={() => setToggling(a)} />
      ),
    },
  ];

  return (
    <TerritoryLevelFrame
      title="Areas"
      description="Areas under each HQ. The type decides which DA rate applies."
      noun="area"
      readOnly={readOnly}
      onNew={() => setForm({})}
      filters={
        <>
          <Input placeholder="Search areas" aria-label="Search areas" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="w-52">
            <Select
              aria-label="HQ"
              value={values.hqId || 'all'}
              onValueChange={(v) => update({ hqId: v === 'all' ? '' : v })}
              options={[{ value: 'all', label: 'All HQs' }, ...hqs.options]}
            />
          </div>
          <div className="w-44">
            <Select
              aria-label="Type"
              value={values.type || 'all'}
              onValueChange={(v) => update({ type: v === 'all' ? '' : v })}
              options={[{ value: 'all', label: 'All types' }, ...AREA_TYPE_OPTIONS]}
            />
          </div>
          <StatusFilter value={values.status} onChange={(v) => update({ status: v })} />
        </>
      }
      query={areas}
      columns={columns}
      emptyDescription="No area matches these filters."
      onPageChange={(p) => update({ page: p })}
    >
      {form ? <AreaFormDialog area={form.area} onClose={() => setForm(null)} /> : null}
      <StatusToggleDialog
        item={toggling}
        noun="area"
        pending={updateArea.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) => toggling && updateArea.mutate({ id: toggling.id, body: { status } })}
      />
    </TerritoryLevelFrame>
  );
}
