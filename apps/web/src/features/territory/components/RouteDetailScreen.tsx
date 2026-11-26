'use client';

import type { RouteDto } from '@greynote/contracts';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAllHqs } from '../hooks/useHqs';
import { useRoute } from '../hooks/useRoutes';
import { kmLabel } from '../lib/routeDraft';
import { Card } from '@/components/ui/Card';
import { usePlaceDirectory } from '../hooks/usePlaces';
import { PlaceRouteDetailsCard } from './PlaceRouteDetailsCard';
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
        {route.data ? <RouteDetailBody route={route.data} /> : null}
      </DataState>
    </>
  );
}

function RouteDetailBody({ route }: { route: RouteDto }) {
  const readOnly = useIsReadOnly();
  const hqs = useAllHqs();
  const hq = hqs.data?.find((h) => h.id === route.hqId);

  return (
    <div className="space-y-6">
      <PageHeader
        title={route.name}
        description={hq ? `${hq.name} · ${kmLabel(route)}` : undefined}
        actions={<Badge tone={route.status === 'active' ? 'success' : 'neutral'}>{route.status === 'active' ? 'Active' : 'Inactive'}</Badge>}
      />

      {route.fromPlaceId ? (
        <PlaceRouteDetailsCard
          key={`${route.name}:${route.distanceKm}:${route.taPerKmRateOverridePaise}:${route.taFixedPaise}:${route.status}`}
          route={route}
          readOnly={readOnly}
        />
      ) : (
        // A route from before Places that the migration has not reached yet.
        <RouteDetailsCard
          key={`${route.name}:${route.distanceKm}:${route.type}:${route.taPerKmRateOverridePaise}:${route.status}`}
          route={route}
          hqLabel={hq?.name ?? '—'}
          readOnly={readOnly}
        />
      )}

      <WhoPlansCard route={route} hqName={(id) => hqs.data?.find((h) => h.id === id)?.name ?? '—'} />
    </div>
  );
}

/**
 * Nobody is given a route any more (decision-log 2026-11-26): everyone based in the HQ of either end can plan it, and a manager can plan
 * it for a trip with their team.
 */
function WhoPlansCard({ route, hqName }: { route: RouteDto; hqName: (id: string) => string }) {
  const places = usePlaceDirectory();
  const ends = [route.fromPlaceId, route.toPlaceId].map((id) => (id ? places.byId.get(id)?.hqId : undefined)).filter((id): id is string => !!id);
  const hqIds = [...new Set(ends.length > 0 ? ends : [route.hqId])];
  return (
    <Card title="Who can plan it">
      <p className="p-5 text-sm text-text-muted">
        Everyone based in {hqIds.map(hqName).join(' and ')}, and the managers of people based there. No one is assigned to a route.
      </p>
    </Card>
  );
}
