'use client';

import { ROUTE_TYPES, type RouteDto } from '@greynote/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { paiseToRupees } from '@/lib/money';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useHqOptions, useZoneOptions } from '../hooks/useParentOptions';
import { useRoutes } from '../hooks/useRoutes';
import { ROUTE_TYPE_LABEL } from '../lib/draft';
import { kmLabel } from '../lib/routeDraft';
import { StatusFilter } from '@/components/ui/StatusFilter';
import { PagedListFrame } from '@/components/ui/PagedListFrame';

export function RoutesScreen() {
  const router = useRouter();
  const { values, page, pageSize, update } = useFilterParams(['search', 'status', 'zoneId', 'hqId', 'type']);
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
    { key: 'hq', header: 'HQ', render: (r) => hqs.nameOf.get(r.hqId) ?? '—' },
    { key: 'destination', header: 'To', render: (r) => r.destinationName },
    { key: 'type', header: 'Type', render: (r) => ROUTE_TYPE_LABEL[r.type] },
    {
      key: 'distance',
      header: 'Distance',
      numeric: true,
      render: (r) => (r.distanceKm === null ? <Badge tone="danger">Not set</Badge> : <span className="tabular-nums">{kmLabel(r)}</span>),
    },
    {
      key: 'rate',
      header: 'Rate / km',
      numeric: true,
      render: (r) => (r.taPerKmRateOverridePaise === null ? <span className="text-text-subtle">Pay band</span> : `₹${paiseToRupees(r.taPerKmRateOverridePaise)}`),
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
      description="Where an MR travels from an HQ, with the km TA is paid on."
      noun="route"
      readOnly={readOnly}
      onNew={() => router.push('/routes/new')}
      filters={
        <>
          <Input placeholder="Search routes" aria-label="Search routes" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="w-44">
            <Select
              aria-label="Zone"
              value={values.zoneId || 'all'}
              onValueChange={(v) => update({ zoneId: v === 'all' ? '' : v })}
              options={[{ value: 'all', label: 'All zones' }, ...zones.options]}
            />
          </div>
          <div className="w-44">
            <Select
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
      query={routes}
      columns={columns}
      emptyDescription="No route matches these filters."
      onPageChange={(p) => update({ page: p })}
      pageSize={pageSize}
      onPageSizeChange={(n) => update({ pageSize: n })}
    />
  );
}
