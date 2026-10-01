'use client';

import type { ZoneDto } from '@greynote/contracts';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { toErrorState } from '@/lib/api/toErrorState';
import { timing } from '@/lib/hooks/timing';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useZones } from '../hooks/useZones';

const columns: readonly Column<ZoneDto>[] = [
  { key: 'name', header: 'Zone', render: (z) => z.name },
  {
    key: 'status',
    header: 'Status',
    render: (z) => <Badge tone={z.status === 'active' ? 'success' : 'neutral'}>{z.status}</Badge>,
  },
];

export function ZonesScreen() {
  const { values, page, update } = useFilterParams(['search']);
  const [search, setSearch] = useState(values.search);
  const debounced = useDebouncedValue(search, timing.searchDebounceMs);

  useEffect(() => {
    if (debounced !== values.search) update({ search: debounced });
    // `update` changes with the URL; only a new debounced value should push to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const zones = useZones({ page, search: values.search || undefined });

  return (
    <>
      <PageHeader title="Zones" description="Top of the territory hierarchy." />
      <div className="rounded-lg border border-border bg-surface">
        <div className="p-3">
          <Input
            placeholder="Search zones"
            aria-label="Search zones"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <TopProgressBar active={zones.isFetching && !zones.isLoading} />
        <DataState
          isLoading={zones.isLoading}
          error={zones.error ? toErrorState(zones.error, () => void zones.refetch()) : null}
          isEmpty={zones.data?.items.length === 0}
          empty={{ title: 'No zones', description: 'No zone matches this search.' }}
        >
          <DataTable columns={columns} rows={zones.data?.items ?? []} rowKey={(z) => z.id} />
          {zones.data ? (
            <Pagination
              page={zones.data.page}
              totalPages={zones.data.totalPages}
              total={zones.data.total}
              onPageChange={(p) => update({ page: p })}
            />
          ) : null}
        </DataState>
      </div>
    </>
  );
}
