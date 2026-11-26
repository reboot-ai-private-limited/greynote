'use client';

import type { UserDetailDto } from '@greynote/contracts';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import type { UserRouteDto } from '@/lib/api/endpoints/territory';
import { toErrorState } from '@/lib/api/toErrorState';
import { useManagerCoverage } from '@/features/territory/hooks/useManagerCoverage';
import { useUserRoutes } from '@/features/territory/hooks/useUserRoutes';
import { ROUTE_TYPE_LABEL } from '@/features/territory/lib/draft';

/**
 * The routes this employee can plan: every active route of their HQ (decision-log 2026-11-26). Nobody is given routes one by one any more,
 * so there is nothing to add or remove here: add a route under Territory → Routes and everyone based in its HQ can plan it. A manager
 * also plans their team's HQs on their Tour Plan; that is not listed here.
 */
export function RoutesSection({ user }: { user: UserDetailDto; readOnly?: boolean }) {
  const routes = useUserRoutes(user.id);
  const coverage = useManagerCoverage(user.id);
  const hqId = coverage.data?.hqIds[0];

  const columns: readonly Column<UserRouteDto>[] = [
    {
      key: 'name',
      header: 'Route',
      render: (r) => (
        <Link href={`/routes/${r.id}`} className="font-medium text-text hover:text-accent hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: 'type', header: 'Type', render: (r) => ROUTE_TYPE_LABEL[r.routeType as keyof typeof ROUTE_TYPE_LABEL] ?? r.routeType },
    { key: 'km', header: 'Km', numeric: true, render: (r) => (r.distanceKm === null ? '—' : `${r.distanceKm} km`) },
  ];

  return (
    <Card
      title="Routes"
      description="Every active route of their HQ. Add routes under Territory → Routes; there is no assigning per person."
      actions={
        hqId ? (
          <Link href={`/routes?hqId=${hqId}`} className="text-sm text-accent hover:underline">
            Open in Routes
          </Link>
        ) : null
      }
    >
      <div className="p-5">
        <DataState
          isLoading={routes.isLoading}
          error={routes.error ? toErrorState(routes.error, () => void routes.refetch()) : null}
          isEmpty={(routes.data ?? []).length === 0}
          empty={{ title: hqId ? 'Their HQ has no active routes yet' : 'No HQ set, so no routes' }}
        >
          <DataTable bleed={false} columns={columns} rows={routes.data ?? []} rowKey={(r) => r.id} />
        </DataState>
      </div>
    </Card>
  );
}
