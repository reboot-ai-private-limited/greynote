'use client';

import { ROUTE_TYPES, type RouteDto } from '@greynote/contracts';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { paiseToRupees } from '@/lib/money';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useHqOptions, useZoneOptions } from '../hooks/useParentOptions';
import { usePlaceDirectory } from '../hooks/usePlaces';
import { useRoutes } from '../hooks/useRoutes';
import { RoutesImportDialog } from './RoutesImportDialog';
import { ROUTE_TYPE_LABEL } from '../lib/draft';
import { kmLabel } from '../lib/routeDraft';
import { StatusFilter } from '@/components/ui/StatusFilter';
import { PagedListFrame } from '@/components/ui/PagedListFrame';

export function RoutesScreen() {
  const router = useRouter();
  const { values, page, pageSize, update } = useFilterParams(['search', 'status', 'zoneId', 'hqId', 'type', 'placeId']);
  const places = usePlaceDirectory();
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const zones = useZoneOptions();
  const hqs = useHqOptions();

  const routes = useRoutes({
    page,
    pageSize,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as RouteDto['status'] }),
    ...(values.zoneId && { zoneId: values.zoneId }),
    ...(values.hqId && { hqId: values.hqId }),
    ...(values.type && { type: values.type as RouteDto['type'] }),
    ...(values.placeId && { placeId: values.placeId }),
  });

  const columns: readonly Column<RouteDto>[] = [
    {
      key: 'name',
      header: 'Route',
      render: (r) => (
        <Link href={`/routes/${r.id}`} className="font-medium text-text hover:text-accent hover:underline">
          {r.name}
        </Link>
      ),
    },
    // A route from before Places has no ends: its HQ town is its From.
    { key: 'from', header: 'From', render: (r) => (r.fromPlaceId ? places.labelOf(r.fromPlaceId) : (hqs.nameOf.get(r.hqId) ?? '—')) },
    { key: 'to', header: 'To', render: (r) => (r.toPlaceId ? places.labelOf(r.toPlaceId) : r.destinationName) },
    { key: 'type', header: 'Type', render: (r) => ROUTE_TYPE_LABEL[r.type] },
    {
      key: 'distance',
      header: 'Distance',
      numeric: true,
      render: (r) => (r.distanceKm === null ? <Badge tone="danger">Not set</Badge> : <span className="tabular-nums">{kmLabel(r)}</span>),
    },
    {
      key: 'ta',
      header: 'TA',
      numeric: true,
      render: (r) =>
        r.taFixedPaise != null ? (
          `₹${paiseToRupees(r.taFixedPaise)} fixed`
        ) : r.taPerKmRateOverridePaise === null ? (
          <span className="text-text-subtle">Grade rate</span>
        ) : (
          `₹${paiseToRupees(r.taPerKmRateOverridePaise)} / km`
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge tone={r.status === 'active' ? 'success' : 'neutral'}>{r.status === 'active' ? 'Active' : 'Inactive'}</Badge>,
    },
  ];

  return (
    <PagedListFrame
      title="Routes"
      description="From one place to another, with the one-way km TA is paid on. A route works both ways."
      noun="route"
      readOnly={readOnly}
      onNew={() => router.push(values.placeId ? `/routes/new?from=${values.placeId}` : '/routes/new')}
      actions={
        <Button variant="secondary" disabled={readOnly} onClick={() => setImporting(true)}>
          <Upload aria-hidden className="size-4" /> Upload CSV
        </Button>
      }
      filters={
        <>
          <Input placeholder="Search routes" aria-label="Search routes" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
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
          <div className="w-52">
            <SearchableSelect
              aria-label="Place"
              value={values.placeId || 'all'}
              onValueChange={(v) => update({ placeId: v === 'all' ? '' : v })}
              options={[{ value: 'all', label: 'Any place' }, ...places.options]}
              searchPlaceholder="Search places"
            />
          </div>
          <StatusFilter value={values.status} onChange={(v) => update({ status: v })} />
        </>
      }
      query={routes}
      columns={columns}
      emptyDescription="No route matches these filters."
      onPageChange={(p) => update({ page: p })}
      pageSize={pageSize}
      onPageSizeChange={(n) => update({ pageSize: n })}
    >
      {importing ? <RoutesImportDialog onClose={() => setImporting(false)} /> : null}
    </PagedListFrame>
  );
}
