'use client';

import type { TerritoryGapDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { toast } from '@/components/ui/toast';
import { RouteChecklist } from '@/features/territory/components/RouteChecklist';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import {
  useExtendManagerTerritory,
  useTeamGaps,
} from '@/features/territory/hooks/useManagerCoverage';
import { useActiveRoutes } from '@/features/territory/hooks/useRoutes';
import { useAllZones } from '@/features/territory/hooks/useZones';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';

/** ASM and RSM may hold routes; a ZSM and the NSM get Zones only. */
const holdsRoutes = (level: number) => level === 2 || level === 3;

/**
 * Managers whose direct reports cover Zones, HQs or routes the manager does not: people placed under a manager before choosing one could
 * extend the manager's territory. Review each, untick any route not wanted, and apply; it only adds, so applying twice changes nothing.
 */
export function TeamGapsScreen() {
  const readOnly = useIsReadOnly();
  const gaps = useTeamGaps();
  const rows = gaps.data ?? [];
  const extend = useExtendManagerTerritory();
  const hqs = useAllHqs();
  const [applying, setApplying] = useState(false);

  async function applyAll() {
    setApplying(true);
    try {
      for (const g of rows)
        await extend.mutateAsync({
          managerId: g.managerId,
          body: bodyOf(g, hqs.data ?? [], g.routeIds),
        });
      toast.success(`${rows.length} manager${rows.length === 1 ? '' : 's'} updated.`);
    } catch {
      // The failed call already toasted why; the ones before it stay applied.
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Territory gaps"
        description="Managers whose direct reports work in Zones, HQs or routes the manager does not have. Review and add; nothing is removed."
        actions={
          <Button
            disabled={readOnly || applying || rows.length === 0}
            onClick={() => void applyAll()}
          >
            {applying ? 'Applying…' : `Apply to all ${rows.length || ''}`.trim()}
          </Button>
        }
      />
      <DataState
        isLoading={gaps.isLoading}
        error={gaps.error ? toErrorState(gaps.error, () => void gaps.refetch()) : null}
        isEmpty={rows.length === 0}
        empty={{
          title: 'No gaps',
          description: 'Every manager already covers what their direct reports work in.',
        }}
      >
        <div className="space-y-4">
          {rows.map((g) => (
            <GapCard key={g.managerId} gap={g} readOnly={readOnly} />
          ))}
        </div>
      </DataState>
    </>
  );
}

function bodyOf(
  g: TerritoryGapDto,
  hqs: ReadonlyArray<{ id: string; zoneId: string }>,
  routeIds: string[],
) {
  const zoneIds = [
    ...new Set([
      ...g.zoneIds,
      ...g.hqIds.map((id) => hqs.find((h) => h.id === id)?.zoneId).filter((z): z is string => !!z),
    ]),
  ];
  return { hqIds: g.hqIds, zoneIds, routeIds: holdsRoutes(g.level) ? routeIds : [] };
}

function GapCard({ gap, readOnly }: { gap: TerritoryGapDto; readOnly: boolean }) {
  const hqs = useAllHqs();
  const zones = useAllZones();
  const routes = useActiveRoutes(undefined, gap.routeIds.length > 0);
  const extend = useExtendManagerTerritory();
  const [routeIds, setRouteIds] = useState<string[]>(gap.routeIds);
  const name = (list: ReadonlyArray<{ id: string; name: string }> | undefined, ids: string[]) =>
    ids.map((id) => list?.find((x) => x.id === id)?.name ?? id).join(', ');
  const missing = (routes.data ?? []).filter((r) => gap.routeIds.includes(r.id));

  return (
    <Card
      title={`${gap.name} (${gap.designation ?? '—'})`}
      description={`${gap.employeeCode} · ${gap.reports} direct report${gap.reports === 1 ? '' : 's'}`}
      actions={
        <Button
          size="sm"
          disabled={readOnly || extend.isPending}
          onClick={() =>
            extend.mutate({ managerId: gap.managerId, body: bodyOf(gap, hqs.data ?? [], routeIds) })
          }
        >
          Add
        </Button>
      }
    >
      <div className="space-y-3 px-5 py-4 text-sm">
        {gap.zoneIds.length > 0 ? (
          <p>
            <span className="font-medium">Zones missing:</span> {name(zones.data, gap.zoneIds)}
          </p>
        ) : null}
        {gap.hqIds.length > 0 ? (
          <p>
            <span className="font-medium">HQs missing:</span> {name(hqs.data, gap.hqIds)}
          </p>
        ) : null}
        {gap.routeIds.length > 0 ? (
          <div>
            <p className="mb-2 font-medium">
              Routes their team has ({routeIds.length} of {gap.routeIds.length} ticked)
            </p>
            {routes.isLoading ? (
              <p className="text-[13px] text-text-subtle">Loading…</p>
            ) : (
              <RouteChecklist
                routes={missing}
                selected={routeIds}
                onChange={setRouteIds}
                hqs={hqs.data ?? []}
                zones={zones.data ?? []}
                emptyText="No routes."
              />
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
