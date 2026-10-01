'use client';

import type { AreaDto, HqDto, TerritoryStatus, ZoneDto } from '@greynote/contracts';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { Tree } from '@/components/ui/Tree';
import { toErrorState } from '@/lib/api/toErrorState';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { addToSet, toggleSet } from '@/lib/tree';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useUpdateArea, useUpdateHq, useUpdateZone } from '../hooks/useTerritoryMutations';
import { useZones } from '../hooks/useZones';
import { AreaFormDialog } from './AreaFormDialog';
import { HqFormDialog } from './HqFormDialog';
import { StatusToggleDialog } from './StatusToggleDialog';
import { TerritorySearchResults } from './TerritorySearchResults';
import { TerritoryTreeContext, type TerritoryTree } from './TerritoryTreeContext';
import { ZoneNode } from './TreeNodes';
import { ZoneFormDialog } from './ZoneFormDialog';

type Dialog =
  | { type: 'zone'; zone?: ZoneDto }
  | { type: 'hq'; hq?: HqDto; zoneId?: string }
  | { type: 'area'; area?: AreaDto; hqId?: string };

type Toggling = { noun: string; item: { id: string; name: string; status: TerritoryStatus }; kind: 'zone' | 'hq' | 'area' };

const ZONE_PAGE = 100;

/**
 * Zone › HQ › Area on one page. Branches load lazily when opened; a search swaps the tree for a flat
 * list because unloaded branches cannot be filtered.
 */
export function TerritoryTreeScreen() {
  const { values, update } = useFilterParams(['search', 'inactive']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const showInactive = values.inactive === '1';
  const readOnly = useIsReadOnly();

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toggling, setToggling] = useState<Toggling | null>(null);
  const close = () => setDialog(null);
  const closeToggle = () => setToggling(null);

  const updateZone = useUpdateZone(closeToggle);
  const updateHq = useUpdateHq(closeToggle);
  const updateArea = useUpdateArea(closeToggle);

  const zones = useZones({ page: 1, pageSize: ZONE_PAGE, ...(!showInactive && { status: 'active' as const }) });

  const tree = useMemo<TerritoryTree>(
    () => ({
      readOnly,
      showInactive,
      isExpanded: (id) => expanded.has(id),
      toggle: (id) => setExpanded((s) => toggleSet(s, id)),
      edit: {
        zone: (zone) => setDialog({ type: 'zone', zone }),
        hq: (hq) => setDialog({ type: 'hq', hq }),
        area: (area) => setDialog({ type: 'area', area }),
      },
      toggleStatus: {
        zone: (item) => setToggling({ noun: 'zone', item, kind: 'zone' }),
        hq: (item) => setToggling({ noun: 'HQ', item, kind: 'hq' }),
        area: (item) => setToggling({ noun: 'area', item, kind: 'area' }),
      },
      // Open the parent first so the new child is visible as soon as it is saved.
      addHq: (zoneId) => {
        setExpanded((s) => addToSet(s, zoneId));
        setDialog({ type: 'hq', zoneId });
      },
      addArea: (hqId) => {
        setExpanded((s) => addToSet(s, hqId));
        setDialog({ type: 'area', hqId });
      },
    }),
    [readOnly, showInactive, expanded],
  );

  function confirmToggle(status: TerritoryStatus) {
    if (!toggling) return;
    const call = { id: toggling.item.id, body: { status } };
    if (toggling.kind === 'zone') updateZone.mutate(call);
    else if (toggling.kind === 'hq') updateHq.mutate(call);
    else updateArea.mutate(call);
  }

  const term = values.search.trim();

  return (
    <TerritoryTreeContext.Provider value={tree}>
      <PageHeader
        title="Territory"
        description="Zones, their HQs, and each HQ's areas."
        actions={
          <Button onClick={() => setDialog({ type: 'zone' })} disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined}>
            <Plus aria-hidden className="size-4" /> New zone
          </Button>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-4 border-b border-border p-4">
          <Input
            placeholder="Search zones, HQs and areas"
            aria-label="Search territory"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => update({ inactive: e.target.checked ? '1' : '' })}
              className="size-4 accent-accent"
            />
            Show inactive
          </label>
        </div>

        {term ? (
          <TerritorySearchResults term={term} />
        ) : (
          <DataState
            isLoading={zones.isLoading}
            error={zones.error ? toErrorState(zones.error, () => void zones.refetch()) : null}
            isEmpty={zones.data?.items.length === 0}
            empty={{
              title: 'No zones yet',
              description: 'Start the hierarchy with a zone, then add its HQs and areas.',
              action: (
                <Button size="sm" disabled={readOnly} onClick={() => setDialog({ type: 'zone' })}>
                  Create your first zone
                </Button>
              ),
            }}
            skeleton={<SkeletonTable rows={5} />}
          >
            <div className="p-2">
              <Tree
                label="Territory"
                onExpand={(id) => setExpanded((s) => addToSet(s, id))}
                onCollapse={(id) => setExpanded((s) => toggleSet(s, id))}
              >
                {zones.data?.items.map((zone) => <ZoneNode key={zone.id} zone={zone} />)}
              </Tree>
              {zones.data && zones.data.total > zones.data.items.length ? (
                <p className="px-4 py-3 text-[13px] text-text-subtle">
                  Showing the first {zones.data.items.length} of {zones.data.total} zones — use search to find the rest.
                </p>
              ) : null}
            </div>
          </DataState>
        )}
      </Card>

      {dialog?.type === 'zone' ? <ZoneFormDialog zone={dialog.zone} onClose={close} /> : null}
      {dialog?.type === 'hq' ? <HqFormDialog hq={dialog.hq} defaultZoneId={dialog.zoneId} onClose={close} /> : null}
      {dialog?.type === 'area' ? <AreaFormDialog area={dialog.area} defaultHqId={dialog.hqId} onClose={close} /> : null}
      <StatusToggleDialog
        item={toggling?.item ?? null}
        noun={toggling?.noun ?? ''}
        pending={updateZone.isPending || updateHq.isPending || updateArea.isPending}
        onClose={closeToggle}
        onConfirm={confirmToggle}
      />
    </TerritoryTreeContext.Provider>
  );
}
