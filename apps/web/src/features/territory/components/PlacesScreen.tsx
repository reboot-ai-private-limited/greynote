'use client';

import { ROUTE_TYPES, type PlaceDto } from '@greynote/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { RowActions } from '@/components/ui/RowActions';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { StatusFilter } from '@/components/ui/StatusFilter';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useHqOptions, useZoneOptions } from '../hooks/useParentOptions';
import { usePlaces, useUpdatePlace } from '../hooks/usePlaces';
import { ROUTE_TYPE_LABEL } from '../lib/draft';
import { PlaceFormDialog } from './PlaceFormDialog';

/** Towns and stations under each HQ (decision-log 2026-11-26). Routes run between them; doctors will sit on them. */
export function PlacesScreen() {
  const { values, page, pageSize, update } = useFilterParams(['search', 'status', 'zoneId', 'hqId', 'type']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const zones = useZoneOptions();
  const hqs = useHqOptions();
  const [form, setForm] = useState<{ place?: PlaceDto } | null>(null);
  const [toggling, setToggling] = useState<PlaceDto | null>(null);
  const updatePlace = useUpdatePlace(() => setToggling(null));

  const places = usePlaces({
    page,
    pageSize,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as PlaceDto['status'] }),
    ...(values.zoneId && { zoneId: values.zoneId }),
    ...(values.hqId && { hqId: values.hqId }),
    ...(values.type && { type: values.type as PlaceDto['type'] }),
  });

  const columns: readonly Column<PlaceDto>[] = [
    {
      key: 'name',
      header: 'Place',
      render: (p) => (
        <span className="inline-flex items-center gap-2 font-medium">
          {p.name}
          {p.isHqTown ? <Badge tone="accent">HQ town</Badge> : null}
        </span>
      ),
    },
    { key: 'hq', header: 'HQ', render: (p) => hqs.nameOf.get(p.hqId) ?? '—' },
    { key: 'type', header: 'Type', render: (p) => ROUTE_TYPE_LABEL[p.type] },
    {
      key: 'routes',
      header: '',
      render: (p) => (
        <Link href={`/routes?placeId=${p.id}`} className="text-sm text-accent hover:underline">
          Routes
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status === 'active' ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      // The HQ town follows its HQ: rename or deactivate the HQ instead.
      render: (p) =>
        p.isHqTown ? null : (
          <RowActions label={p.name} status={p.status} disabled={readOnly} onEdit={() => setForm({ place: p })} onToggleStatus={() => setToggling(p)} />
        ),
    },
  ];

  return (
    <PagedListFrame
      title="Places"
      description="Towns and stations under each HQ. Routes run from one place to another. Each HQ has its HQ town, which follows the HQ."
      noun="place"
      readOnly={readOnly}
      onNew={() => setForm({})}
      filters={
        <>
          <Input placeholder="Search places" aria-label="Search places" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="w-44">
            <SearchableSelect
              aria-label="Zone"
              value={values.zoneId || 'all'}
              onValueChange={(v) => update({ zoneId: v === 'all' ? '' : v })}
              options={[{ value: 'all', label: 'All zones' }, ...zones.options]}
            />
          </div>
          <div className="w-44">
            <SearchableSelect
              aria-label="HQ"
              value={values.hqId || 'all'}
              onValueChange={(v) => update({ hqId: v === 'all' ? '' : v })}
              options={[{ value: 'all', label: 'All HQs' }, ...hqs.options]}
            />
          </div>
          <div className="w-40">
            <Select
              aria-label="Type"
              value={values.type || 'all'}
              onValueChange={(v) => update({ type: v === 'all' ? '' : v })}
              options={[{ value: 'all', label: 'All types' }, ...ROUTE_TYPES.map((t) => ({ value: t, label: ROUTE_TYPE_LABEL[t] }))]}
            />
          </div>
          <StatusFilter value={values.status} onChange={(v) => update({ status: v })} />
        </>
      }
      query={places}
      columns={columns}
      emptyDescription="No place matches these filters."
      onPageChange={(p) => update({ page: p })}
      pageSize={pageSize}
      onPageSizeChange={(n) => update({ pageSize: n })}
    >
      {form ? <PlaceFormDialog place={form.place} defaultHqId={values.hqId || undefined} onClose={() => setForm(null)} /> : null}
      <StatusToggleDialog
        item={toggling}
        noun="place"
        pending={updatePlace.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) => toggling && updatePlace.mutate({ id: toggling.id, body: { status } })}
      />
    </PagedListFrame>
  );
}
