'use client';

import { Badge } from '@/components/ui/Badge';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { toErrorState } from '@/lib/api/toErrorState';
import { useAreas } from '../hooks/useAreas';
import { useHqs } from '../hooks/useHqs';
import { useHqOptions, useZoneOptions } from '../hooks/useParentOptions';
import { useZones } from '../hooks/useZones';
import { searchRows, type NodeKind, type SearchRow } from '../lib/tree';
import { RowActions } from './RowActions';
import { useTerritoryTree } from './TerritoryTreeContext';

const LIMIT = 20;
const LEVEL: Record<NodeKind, string> = { zone: 'Zone', hq: 'HQ', area: 'Area' };

/**
 * The tree cannot be filtered while its branches are unloaded, so a search replaces it with a flat
 * list across all three levels, each row showing where it sits (Zone › HQ).
 */
export function TerritorySearchResults({ term }: { term: string }) {
  const t = useTerritoryTree();
  const filter = { page: 1, pageSize: LIMIT, search: term, ...(!t.showInactive && { status: 'active' as const }) };
  const zones = useZones(filter);
  const hqs = useHqs(filter);
  const areas = useAreas(filter);
  const zoneLookup = useZoneOptions();
  const hqLookup = useHqOptions();

  const queries = [zones, hqs, areas];
  const failed = queries.find((q) => q.error);
  const rows = searchRows(
    { zones: zones.data?.items ?? [], hqs: hqs.data?.items ?? [], areas: areas.data?.items ?? [] },
    {
      zoneName: (id) => zoneLookup.nameOf.get(id),
      hqName: (id) => hqLookup.nameOf.get(id),
      hqZoneId: (id) => hqLookup.zoneIdOf.get(id),
    },
  );
  const truncated = queries.some((q) => q.data && q.data.total > LIMIT);

  const columns: readonly Column<SearchRow>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'level', header: 'Level', render: (r) => <Badge tone="accent">{LEVEL[r.kind]}</Badge> },
    { key: 'path', header: 'Under', render: (r) => r.path || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge tone={r.status === 'active' ? 'success' : 'neutral'}>{r.status === 'active' ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (r) => {
        const zone = zones.data?.items.find((z) => z.id === r.id);
        const hq = hqs.data?.items.find((h) => h.id === r.id);
        const area = areas.data?.items.find((a) => a.id === r.id);
        return (
          <RowActions
            label={r.name}
            status={r.status}
            disabled={t.readOnly}
            onEdit={() => (r.kind === 'zone' && zone ? t.edit.zone(zone) : r.kind === 'hq' && hq ? t.edit.hq(hq) : area && t.edit.area(area))}
            onToggleStatus={() =>
              r.kind === 'zone' && zone ? t.toggleStatus.zone(zone) : r.kind === 'hq' && hq ? t.toggleStatus.hq(hq) : area && t.toggleStatus.area(area)
            }
          />
        );
      },
    },
  ];

  return (
    <DataState
      isLoading={queries.some((q) => q.isLoading)}
      error={failed ? toErrorState(failed.error, () => queries.forEach((q) => void q.refetch())) : null}
      isEmpty={rows.length === 0}
      empty={{ title: 'No matches', description: `Nothing in Territory matches “${term}”.` }}
    >
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.key} />
      {truncated ? (
        <p className="border-t border-border px-5 py-3 text-[13px] text-text-subtle">
          Showing the first {LIMIT} of each level — refine your search to narrow it down.
        </p>
      ) : null}
    </DataState>
  );
}
