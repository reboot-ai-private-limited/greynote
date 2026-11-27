'use client';

import type { HqDto, ZoneDto } from '@greynote/contracts';
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Input } from '@/components/ui/Input';
import { RowMenu } from '@/components/ui/RowActions';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAllHqs } from '../hooks/useHqs';
import { useUpdateHq, useUpdateZone } from '../hooks/useTerritoryMutations';
import { useAllZones } from '../hooks/useZones';
import { zoneTree } from '../lib/zoneTree';
import { DeleteTerritoryDialog } from './DeleteTerritoryDialog';
import { HqFormDialog } from './HqFormDialog';
import { ZoneFormDialog } from './ZoneFormDialog';

/**
 * The left side of the Territory page (2026-11-27): a search over zones and HQs, then Zones as folders with their HQs inside, and the add /
 * rename / deactivate / delete actions for both. Zones start closed except the chosen HQ's; Expand all / Collapse all opens or closes every
 * one. The list grows with the page (no scroll of its own). Choosing an HQ opens it on the right.
 */
export function ZoneHqPanel({ selectedHqId, onSelect }: { selectedHqId: string | null; onSelect: (hqId: string) => void }) {
  const readOnly = useIsReadOnly();
  const zones = useAllZones();
  const hqs = useAllHqs();
  const [search, setSearch] = useState('');
  /** Zones opened or closed by hand; any other zone is open only when it holds the chosen HQ. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [zoneForm, setZoneForm] = useState<{ zone?: ZoneDto } | null>(null);
  const [hqForm, setHqForm] = useState<{ hq?: HqDto; zoneId?: string } | null>(null);
  const [toggling, setToggling] = useState<{ kind: 'zone'; item: ZoneDto } | { kind: 'hq'; item: HqDto } | null>(null);
  const [deleting, setDeleting] = useState<{ segment: 'zones' | 'hqs'; item: { id: string; name: string } } | null>(null);
  const updateZone = useUpdateZone(() => setToggling(null));
  const updateHq = useUpdateHq(() => setToggling(null));

  const term = search.trim();
  const groups = useMemo(() => zoneTree(zones.data ?? [], hqs.data ?? [], term), [zones.data, hqs.data, term]);
  const selectedZoneId = hqs.data?.find((h) => h.id === selectedHqId)?.zoneId;
  const isOpen = (zoneId: string) => (term ? true : (toggled[zoneId] ?? zoneId === selectedZoneId));
  const allOpen = groups.length > 0 && groups.every((g) => isOpen(g.zone.id));
  const setAll = (open: boolean) => setToggled(Object.fromEntries((zones.data ?? []).map((z) => [z.id, open])));

  if (zones.isLoading || hqs.isLoading) return <Skeleton className="h-80 w-full" />;

  return (
    <nav aria-label="Zones and HQs" className="space-y-3 rounded-lg border border-border bg-surface p-3">
      <Input type="search" placeholder="Search zones or HQs" aria-label="Search zones or HQs" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="flex items-center gap-1">
        <p className="mr-auto text-sm font-semibold text-text">Zones</p>
        {!term && groups.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => setAll(!allOpen)}>
            {allOpen ? <ChevronsDownUp aria-hidden className="size-4" /> : <ChevronsUpDown aria-hidden className="size-4" />}
            {allOpen ? 'Collapse all' : 'Expand all'}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" disabled={readOnly} onClick={() => setZoneForm({})}>
          <Plus aria-hidden className="size-4" /> Zone
        </Button>
      </div>
      {groups.length === 0 ? <p className="px-1 text-[13px] text-text-subtle">{term ? 'No zone or HQ matches.' : 'No zones yet. Add one to start.'}</p> : null}
      <ul className="space-y-1">
        {groups.map(({ zone, hqs: list }) => {
          const open = isOpen(zone.id);
          return (
            <li key={zone.id}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-expanded={open}
                  disabled={Boolean(term)}
                  onClick={() => setToggled((t) => ({ ...t, [zone.id]: !open }))}
                  className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-1.5 text-left text-sm font-medium text-text hover:bg-surface-hover"
                >
                  <ChevronRight aria-hidden className={cn('size-4 shrink-0 text-text-muted transition-transform', open && 'rotate-90')} />
                  <span className="truncate">{zone.name}</span>
                  <span className="text-xs font-normal text-text-subtle">{list.length}</span>
                  {zone.status !== 'active' ? <Badge tone="neutral">Inactive</Badge> : null}
                </button>
                <button
                  type="button"
                  aria-label={`Add an HQ in ${zone.name}`}
                  disabled={readOnly || zone.status !== 'active'}
                  onClick={() => setHqForm({ zoneId: zone.id })}
                  className="rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text disabled:opacity-40"
                >
                  <Plus aria-hidden className="size-4" />
                </button>
                <RowMenu
                  label={zone.name}
                  disabled={readOnly}
                  items={[
                    { label: 'Rename', onSelect: () => setZoneForm({ zone }) },
                    zone.status === 'active'
                      ? { label: 'Deactivate', onSelect: () => setToggling({ kind: 'zone', item: zone }), tone: 'danger' }
                      : { label: 'Reactivate', onSelect: () => setToggling({ kind: 'zone', item: zone }) },
                    { label: 'Delete…', onSelect: () => setDeleting({ segment: 'zones', item: zone }), tone: 'danger' },
                  ]}
                />
              </div>
              {open ? (
                <ul className="ml-5 border-l border-border pl-2">
                  {list.length === 0 ? <li className="px-2 py-1 text-[13px] text-text-subtle">No HQs yet.</li> : null}
                  {list.map((hq) => (
                    <li key={hq.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-current={hq.id === selectedHqId ? 'true' : undefined}
                        onClick={() => onSelect(hq.id)}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-hover',
                          hq.id === selectedHqId ? 'bg-accent-soft font-medium text-accent-soft-text' : 'text-text',
                          hq.status !== 'active' && 'text-text-subtle',
                        )}
                      >
                        <span className="truncate">{hq.name}</span>
                        {hq.status !== 'active' ? <Badge tone="neutral">Inactive</Badge> : null}
                      </button>
                      <RowMenu
                        label={hq.name}
                        disabled={readOnly}
                        items={[
                          { label: 'Rename', onSelect: () => setHqForm({ hq }) },
                          hq.status === 'active'
                            ? { label: 'Deactivate', onSelect: () => setToggling({ kind: 'hq', item: hq }), tone: 'danger' }
                            : { label: 'Reactivate', onSelect: () => setToggling({ kind: 'hq', item: hq }) },
                          { label: 'Delete…', onSelect: () => setDeleting({ segment: 'hqs', item: hq }), tone: 'danger' },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {zoneForm ? <ZoneFormDialog zone={zoneForm.zone} onClose={() => setZoneForm(null)} /> : null}
      {hqForm ? <HqFormDialog hq={hqForm.hq} defaultZoneId={hqForm.zoneId} onClose={() => setHqForm(null)} /> : null}
      <DeleteTerritoryDialog segment={deleting?.segment ?? 'hqs'} item={deleting?.item ?? null} onClose={() => setDeleting(null)} />
      <StatusToggleDialog
        item={toggling?.item ?? null}
        noun={toggling?.kind === 'zone' ? 'zone' : 'HQ'}
        pending={updateZone.isPending || updateHq.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) => {
          if (!toggling) return;
          if (toggling.kind === 'zone') updateZone.mutate({ id: toggling.item.id, body: { status } });
          else updateHq.mutate({ id: toggling.item.id, body: { status } });
        }}
      />
    </nav>
  );
}
