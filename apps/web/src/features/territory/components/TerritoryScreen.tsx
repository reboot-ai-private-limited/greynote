'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useAllHqs } from '../hooks/useHqs';
import { usePlacesMissingRoute } from '../hooks/usePlaces';
import { HqWorkspace } from './HqWorkspace';
import { RoutesScreen } from './RoutesScreen';
import { ZoneHqPanel } from './ZoneHqPanel';

/**
 * Territory in one page (decision-log 2026-11-27): Zones and their HQs on the left; the chosen HQ on the right with its places and routes.
 * "All routes" is the company-wide list (search, filters, CSV upload). The tab and the HQ live in the URL.
 */
export function TerritoryScreen() {
  const { values, update } = useFilterParams(['tab', 'hq']);
  const tab = values.tab === 'routes' ? 'routes' : 'hq';
  const hqId = values.hq || null;

  return (
    <>
      <PageHeader title="Territory" description="Zones, their HQs, the places in each HQ and the routes between them." />
      <Tabs value={tab} onValueChange={(v) => update({ tab: v === 'routes' ? 'routes' : '' })}>
        <TabsList>
          <TabsTrigger value="hq">By HQ</TabsTrigger>
          <TabsTrigger value="routes">All routes</TabsTrigger>
        </TabsList>
        <TabsContent value="hq" className="pt-5">
          <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
            <div className="lg:self-start">
              <ZoneHqPanel selectedHqId={hqId} onSelect={(id) => update({ hq: id })} />
            </div>
            {hqId ? <HqWorkspace key={hqId} hqId={hqId} /> : <StillToDo onPick={(id) => update({ hq: id })} />}
          </div>
        </TabsContent>
        <TabsContent value="routes" className="pt-5">
          <RoutesScreen embedded />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** With no HQ chosen: the HQs whose places still have no route from the HQ town, so Admin can go straight to what's missing. */
function StillToDo({ onPick }: { onPick: (hqId: string) => void }) {
  const missing = usePlacesMissingRoute();
  const hqs = useAllHqs();
  const byHq = useMemo(() => {
    const counts = new Map<string, string[]>();
    for (const p of missing.data ?? []) counts.set(p.hqId, [...(counts.get(p.hqId) ?? []), p.name]);
    return [...counts].map(([id, names]) => ({ id, name: hqs.data?.find((h) => h.id === id)?.name ?? 'HQ', names })).sort((a, b) => a.name.localeCompare(b.name));
  }, [missing.data, hqs.data]);

  return (
    <Card title="Choose an HQ" description="Pick an HQ on the left to see and change its places and routes.">
      <div className="space-y-3 p-5 text-sm">
        {missing.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : byHq.length === 0 ? (
          <p className="text-text-muted">Every place has its route from its HQ town. Nothing is missing.</p>
        ) : (
          <>
            <p className="font-medium text-text">Still to do: places with no route from their HQ town</p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {byHq.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => onPick(h.id)} className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-surface-hover">
                    <span>
                      <span className="font-medium text-text">{h.name}</span>
                      <span className="block text-[13px] text-text-muted">{h.names.slice(0, 6).join(', ')}{h.names.length > 6 ? ` +${h.names.length - 6} more` : ''}</span>
                    </span>
                    <span className="shrink-0 text-warning-fg">{h.names.length} missing</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}
