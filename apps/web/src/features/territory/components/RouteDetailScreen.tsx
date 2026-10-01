'use client';

import type { RouteDto, WaypointDto } from '@greynote/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAreaOptions } from '../hooks/useAreaOptions';
import { useRoute } from '../hooks/useRoutes';
import { useSaveWaypoints } from '../hooks/useRouteMutations';
import { staleRevisionOf } from '../lib/routeDraft';
import { sameWaypoints, validateWaypoints } from '../lib/waypoints';
import { AssignmentsCard } from './AssignmentsCard';
import { DistanceCard } from './DistanceCard';
import { RouteDetailsCard } from './RouteDetailsCard';
import { StopsEditor } from './StopsEditor';

export function RouteDetailScreen({ id }: { id: string }) {
  const route = useRoute(id);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/routes" className="text-text-muted hover:text-accent hover:underline">
          ← Routes
        </Link>
      </p>
      <DataState
        isLoading={route.isLoading}
        error={route.error ? toErrorState(route.error, () => void route.refetch()) : null}
        isEmpty={!route.data}
        empty={{ title: 'Route not found' }}
        skeleton={<Skeleton className="h-64 w-full" />}
      >
        {route.data ? <RouteDetailBody route={route.data} onReload={() => void route.refetch()} /> : null}
      </DataState>
    </>
  );
}

function RouteDetailBody({ route, onReload }: { route: RouteDto; onReload: () => void }) {
  const readOnly = useIsReadOnly();
  const areas = useAreaOptions();
  const area = areas.areaOf.get(route.areaId);
  const save = useSaveWaypoints(route.id);

  // The draft follows the server whenever the route's revision moves (after a save or a reload), and is
  // otherwise the user's own. Derived during render, not in an effect: no flash of stale stops.
  const [draft, setDraft] = useState<WaypointDto[]>(route.waypoints);
  const [seenRevision, setSeenRevision] = useState(route.revision);
  if (route.revision !== seenRevision) {
    setSeenRevision(route.revision);
    setDraft(route.waypoints);
  }

  const dirty = !sameWaypoints(draft, route.waypoints);
  const invalid = validateWaypoints(draft);
  const stale = staleRevisionOf(save.error);

  return (
    <div className="space-y-6">
      <PageHeader
        title={route.name}
        description={area ? `${area.hqName ?? '—'} · ${area.name}` : undefined}
        actions={<Badge tone={route.status === 'active' ? 'success' : 'neutral'}>{route.status === 'active' ? 'Active' : 'Inactive'}</Badge>}
      />

      <RouteDetailsCard
        key={`${route.revision}:${route.name}:${route.taPerKmRateOverridePaise}:${route.status}`}
        route={route}
        areaLabel={area ? `${area.hqName ?? '—'} · ${area.name}` : '—'}
        areaType={area?.type}
        readOnly={readOnly}
      />

      <Card
        title="Stops & distance"
        description="Saving new stops recalculates the distance with Google."
        actions={
          <div className="flex items-center gap-2">
            {dirty ? (
              <Button variant="ghost" size="sm" onClick={() => setDraft(route.waypoints)}>
                Discard changes
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={readOnly || !dirty || invalid !== undefined || save.isPending}
              onClick={() => save.mutate({ waypoints: draft, revision: route.revision })}
            >
              {save.isPending ? 'Saving…' : 'Save stops'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6 p-5">
          <StopsEditor stops={draft} onChange={setDraft} disabled={readOnly} />
          <DistanceCard route={route} readOnly={readOnly} dirty={dirty} />
        </div>
      </Card>

      <AssignmentsCard routeId={route.id} routeActive={route.status === 'active'} readOnly={readOnly} />

      <ConfirmDialog
        open={stale !== null}
        onOpenChange={(open) => !open && save.reset()}
        title="This route was changed elsewhere"
        description="Someone else saved this route while you were editing. Reload to see the latest version — your unsaved stop changes will be discarded."
        confirmLabel="Reload"
        tone="primary"
        onConfirm={() => {
          save.reset();
          setDraft(route.waypoints);
          onReload();
        }}
      />
    </div>
  );
}
