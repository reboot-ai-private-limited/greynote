'use client';

import { ROUTE_TYPES, type RouteDto } from '@greynote/contracts';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { ActionLinks } from '@/components/ui/RowActions';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { paiseToRupees } from '@/lib/money';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAllHqs } from '../hooks/useHqs';
import { useZoneOptions } from '../hooks/useParentOptions';
import { usePlaceDirectory } from '../hooks/usePlaces';
import { useRoutes } from '../hooks/useRoutes';
import { ROUTE_TYPE_LABEL } from '../lib/draft';
import { fixedTaText, kmLabel } from '../lib/routeDraft';
import { hqFilterOptions, pickHq, pickZone } from '../lib/routeFilters';
import { AddRouteDialog } from './AddRouteDialog';
import { DeleteTerritoryDialog } from './DeleteTerritoryDialog';
import { PlaceRouteDialog, RouteStatusDialog } from './PlaceRouteDialog';
import { RoutesImportDialog } from './RoutesImportDialog';

/**
 * The Territory page's "All routes" tab (2026-11-27): every route, with Search, Zone → HQ (the HQ list follows the zone), Type and Status
 * (Active unless changed). A route opens in the route dialog — from its name or View — and `?route=<id>` (old `/routes/<id>` links) opens
 * it straight away.
 */
export function RoutesScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const { values, page, pageSize, update } = useFilterParams(['search', 'status', 'zoneId', 'hqId', 'type', 'route', 'edit']);
  const places = usePlaceDirectory();
  const hqs = useAllHqs();
  const zones = useZoneOptions();
  const readOnly = useIsReadOnly();
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const [importing, setImporting] = useState(false);
  const [addingRoute, setAddingRoute] = useState(false);
  const [toggling, setToggling] = useState<RouteDto | null>(null);
  const [deleting, setDeleting] = useState<RouteDto | null>(null);
  const status = values.status || 'active';
  const hqName = (id: string) => hqs.data?.find((h) => h.id === id)?.name;

  const routes = useRoutes({
    page,
    pageSize,
    ...(values.search && { search: values.search }),
    ...(status !== 'all' && { status: status as RouteDto['status'] }),
    ...(values.zoneId && { zoneId: values.zoneId }),
    ...(values.hqId && { hqId: values.hqId }),
    ...(values.type && { type: values.type as RouteDto['type'] }),
  });
  const filtered = Boolean(values.search || values.zoneId || values.hqId || values.type || values.status);
  const label = (r: RouteDto) => (r.fromPlaceId && r.toPlaceId ? `${places.labelOf(r.fromPlaceId)} ↔ ${places.labelOf(r.toPlaceId)}` : r.name);

  const columns: readonly Column<RouteDto>[] = [
    {
      key: 'name',
      header: 'Route',
      render: (r) => (
        <button type="button" onClick={() => update({ route: r.id, edit: '', page })} className="cursor-pointer text-left font-medium text-text hover:text-accent hover:underline">
          {r.name}
        </button>
      ),
    },
    // A route from before Places has no ends: its HQ town is its From.
    { key: 'from', header: 'From', render: (r) => (r.fromPlaceId ? places.labelOf(r.fromPlaceId) : (hqName(r.hqId) ?? '—')) },
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
          fixedTaText(r.taFixedPaise)
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
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <ActionLinks
          label={r.name}
          disabled={readOnly}
          actions={[
            { label: 'View', alwaysOn: true, onClick: () => update({ route: r.id, edit: '', page }) },
            { label: 'Edit', onClick: () => update({ route: r.id, edit: '1', page }) },
            r.status === 'active' ? { label: 'Deactivate', tone: 'danger', onClick: () => setToggling(r) } : { label: 'Reactivate', onClick: () => setToggling(r) },
            { label: 'Delete…', tone: 'danger', onClick: () => setDeleting(r) },
          ]}
        />
      ),
    },
  ];

  const buttons = (
    <div className="flex gap-2">
      <Button variant="secondary" disabled={readOnly} onClick={() => setImporting(true)}>
        <Upload aria-hidden className="size-4" /> Upload CSV
      </Button>
      <Button disabled={readOnly} onClick={() => setAddingRoute(true)}>
        New route
      </Button>
    </div>
  );

  return (
    <PagedListFrame
      title="Routes"
      description="From one place to another, with the one-way km TA is paid on. A route works both ways."
      noun="route"
      readOnly={readOnly}
      hideHeader={embedded}
      {...(embedded ? { toolbarActions: buttons } : { actions: buttons })}
      filters={
        <>
          <Input placeholder="Search routes or places" aria-label="Search routes" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="w-44">
            <SearchableSelect
              aria-label="Zone"
              value={values.zoneId || 'all'}
              onValueChange={(v) => update(pickZone(hqs.data ?? [], { hqId: values.hqId }, v === 'all' ? '' : v))}
              options={[{ value: 'all', label: 'All zones' }, ...zones.options]}
              searchPlaceholder="Search zones"
            />
          </div>
          <div className="w-48">
            <SearchableSelect
              aria-label="HQ"
              value={values.hqId || 'all'}
              onValueChange={(v) => update(pickHq(hqs.data ?? [], { zoneId: values.zoneId }, v === 'all' ? '' : v))}
              options={[{ value: 'all', label: values.zoneId ? 'All HQs in the zone' : 'All HQs' }, ...hqFilterOptions(hqs.data ?? [], values.zoneId)]}
              searchPlaceholder="Search HQs"
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
          <div className="w-40">
            <Select
              aria-label="Status"
              value={status}
              onValueChange={(v) => update({ status: v === 'active' ? '' : v })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'all', label: 'All statuses' },
              ]}
            />
          </div>
          {filtered ? (
            <button
              type="button"
              onClick={() => update({ search: '', zoneId: '', hqId: '', type: '', status: '' })}
              className="cursor-pointer self-center text-sm font-medium text-accent hover:underline"
            >
              Clear filters
            </button>
          ) : null}
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
      {addingRoute ? <AddRouteDialog onClose={() => setAddingRoute(false)} /> : null}
      {values.route ? (
        <PlaceRouteDialog key={`${values.route}:${values.edit}`} routeId={values.route} mode={values.edit ? 'edit' : 'view'} onClose={() => update({ route: '', edit: '', page })} />
      ) : null}
      <DeleteTerritoryDialog segment="routes" item={deleting ? { id: deleting.id, name: label(deleting) } : null} onClose={() => setDeleting(null)} />
      <RouteStatusDialog route={toggling} label={toggling ? label(toggling) : ''} onClose={() => setToggling(null)} />
    </PagedListFrame>
  );
}
