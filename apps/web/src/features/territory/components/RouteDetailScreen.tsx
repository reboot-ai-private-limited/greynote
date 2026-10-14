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
import { AssignmentsCard } from './AssignmentsCard';
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

      <RouteDetailsCard
        key={`${route.name}:${route.distanceKm}:${route.type}:${route.taPerKmRateOverridePaise}:${route.status}`}
        route={route}
        hqLabel={hq?.name ?? '—'}
        readOnly={readOnly}
      />

      <AssignmentsCard routeId={route.id} routeActive={route.status === 'active'} readOnly={readOnly} />
    </div>
  );
}
