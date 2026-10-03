'use client';

import type { PlaceDto, RouteDto } from '@greynote/contracts';
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
import { useAllHqs } from '../hooks/useHqs';
import { useRoute } from '../hooks/useRoutes';
import { useSaveDestination } from '../hooks/useRouteMutations';
import { samePlace } from '../lib/place';
import { staleRevisionOf } from '../lib/routeDraft';
import { AssignmentsCard } from './AssignmentsCard';
import { DistanceCard } from './DistanceCard';
import { PlacePicker } from './PlacePicker';
import { RouteDetailsCard } from './RouteDetailsCard';

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
  const hqs = useAllHqs();
  const hq = hqs.data?.find((h) => h.id === route.hqId);
  const save = useSaveDestination(route.id);

  // The draft follows the server whenever the route's revision moves (after a save or a reload), and is
  // otherwise the user's own. Derived during render, not in an effect: no flash of a stale destination.
  const [draft, setDraft] = useState<PlaceDto>(route.destination);
  const [seenRevision, setSeenRevision] = useState(route.revision);
  if (route.revision !== seenRevision) {
    setSeenRevision(route.revision);
    setDraft(route.destination);
  }

  const dirty = !samePlace(draft, route.destination);
  const stale = staleRevisionOf(save.error);
  const from = hq?.basePlace ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={route.name}
        description={hq ? `${hq.name}${from ? ` · ${from.label} → ${route.destination.label}` : ''}` : undefined}
        actions={<Badge tone={route.status === 'active' ? 'success' : 'neutral'}>{route.status === 'active' ? 'Active' : 'Inactive'}</Badge>}
      />

      <RouteDetailsCard
        key={`${route.revision}:${route.name}:${route.type}:${route.taPerKmRateOverridePaise}:${route.status}`}
        route={route}
        hqLabel={hq?.name ?? '—'}
        readOnly={readOnly}
      />

      <Card
        title="Destination & distance"
        description={
          from
            ? `Measured by road from ${from.label}, the HQ’s base place. Saving a new destination recalculates the distance with Google.`
            : 'Saving a new destination recalculates the distance with Google.'
        }
        actions={
          <div className="flex items-center gap-2">
            {dirty ? (
              <Button variant="ghost" size="sm" onClick={() => setDraft(route.destination)}>
                Discard changes
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={readOnly || !dirty || save.isPending}
              onClick={() => save.mutate({ destination: draft, revision: route.revision })}
            >
              {save.isPending ? 'Saving…' : 'Save destination'}
            </Button>
          </div>
        }
      >
        <div className="space-y-6 p-5">
          {hq && !from ? (
            <p role="alert" className="rounded-md bg-danger-bg p-3 text-[13px] text-danger-fg">
              This HQ has no base place, so the distance cannot be recalculated. Set the HQ&rsquo;s base place on the HQs page.
            </p>
          ) : null}
          <PlacePicker id="route-destination" label="Destination" value={draft} onChange={setDraft} from={from} disabled={readOnly} />
          <DistanceCard route={route} readOnly={readOnly} dirty={dirty} />
        </div>
      </Card>

      <AssignmentsCard routeId={route.id} routeActive={route.status === 'active'} readOnly={readOnly} />

      <ConfirmDialog
        open={stale !== null}
        onOpenChange={(open) => !open && save.reset()}
        title="This route was changed elsewhere"
        description="Someone else saved this route while you were editing. Reload to see the latest version — your unsaved destination change will be discarded."
        confirmLabel="Reload"
        tone="primary"
        onConfirm={() => {
          save.reset();
          setDraft(route.destination);
          onReload();
        }}
      />
    </div>
  );
}
