'use client';

import type { RouteDto } from '@greynote/contracts';
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
import { useAreaOptions } from '../hooks/useAreaOptions';
import { useRoutes } from '../hooks/useRoutes';
import { distanceSummary } from '../lib/routeDraft';
import { StatusFilter } from '@/components/ui/StatusFilter';
import { PagedListFrame } from '@/components/ui/PagedListFrame';

export function RoutesScreen() {
  const router = useRouter();
  const { values, page, update } = useFilterParams(['search', 'status', 'hqId', 'areaId']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const areas = useAreaOptions();

  const routes = useRoutes({
    page,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as RouteDto['status'] }),
    ...(values.hqId && { hqId: values.hqId }),
    ...(values.areaId && { areaId: values.areaId }),
  });

  // The area filter follows the HQ filter.
  const areaChoices = areas.options.filter((o) => !values.hqId || areas.areaOf.get(o.value)?.hqId === values.hqId);

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
    { key: 'area', header: 'Area', render: (r) => areas.areaOf.get(r.areaId)?.name ?? '—' },
    { key: 'hq', header: 'HQ', render: (r) => areas.areaOf.get(r.areaId)?.hqName ?? '—' },
    { key: 'stops', header: 'Stops', numeric: true, render: (r) => r.waypoints.length },
    {
      key: 'distance',
      header: 'Distance',
      render: (r) => {
        const d = distanceSummary(r);
        return (
          <span className="flex items-center gap-2">
            <span className="tabular-nums">{d.km}</span>
            {d.label !== 'Calculated' ? <Badge tone={d.tone}>{d.label}</Badge> : null}
          </span>
        );
      },
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
      description="The stops an MR travels, with the distance TA is paid on."
      noun="route"
      readOnly={readOnly}
      onNew={() => router.push('/routes/new')}
      filters={
        <>
          <Input placeholder="Search routes" aria-label="Search routes" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="w-48">
            <Select
              aria-label="HQ"
              value={values.hqId || 'all'}
              onValueChange={(v) => update({ hqId: v === 'all' ? '' : v, areaId: '' })}
              options={[{ value: 'all', label: 'All HQs' }, ...areas.hqOptions]}
            />
          </div>
          <div className="w-56">
            <Select
              aria-label="Area"
              value={values.areaId || 'all'}
              onValueChange={(v) => update({ areaId: v === 'all' ? '' : v })}
              options={[{ value: 'all', label: 'All areas' }, ...areaChoices]}
            />
          </div>
          <StatusFilter value={values.status} onChange={(v) => update({ status: v })} />
        </>
      }
      query={routes}
      columns={columns}
      emptyDescription="No route matches these filters."
      onPageChange={(p) => update({ page: p })}
    />
  );
}
