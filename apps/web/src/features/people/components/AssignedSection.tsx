'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useQueries } from '@tanstack/react-query';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { chemistsApi } from '@/lib/api/endpoints/fieldMasterData';
import { toErrorState } from '@/lib/api/toErrorState';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useDistributors } from '@/features/field-master-data/hooks/useDistributors';
import { useDoctors } from '@/features/field-master-data/hooks/useDoctors';
import { useUserRoutes } from '@/features/territory/hooks/useUserRoutes';

const PAGE = { page: 1, pageSize: 100 } as const;

/**
 * What a field employee is responsible for, read only (Admin): the distributors and doctors assigned to them, and the chemists on their routes.
 * Distributors and doctors are changed on their own pages; chemists follow the routes above.
 */
export function AssignedSection({ user }: { user: UserDetailDto }) {
  const distributors = useDistributors({ ...PAGE, assignedUserId: user.id, status: 'active' });
  const doctors = useDoctors({ ...PAGE, assignedUserId: user.id });
  const routes = useUserRoutes(user.id);
  const chemistQueries = useQueries({
    queries: (routes.data ?? []).map((r) => {
      const query = { ...PAGE, routeId: r.id, status: 'active' as const };
      return authedQueryOptions({ queryKey: keys.chemists.list(query), fetch: (token, signal) => chemistsApi.list(token, query, signal), staleTime: staleTime.configuration });
    }),
  });
  const chemists = chemistQueries.flatMap((q) => q.data?.items ?? []);
  const chemistsLoading = routes.isLoading || chemistQueries.some((q) => q.isLoading);

  return (
    <Card title="Assigned" description="Distributors and doctors handed to this employee, and the chemists on their routes. Change them from the distributor or doctor page, or from the routes above.">
      <div className="grid gap-6 p-5 md:grid-cols-3">
        <List
          title="Distributors"
          loading={distributors.isLoading}
          error={distributors.error ? toErrorState(distributors.error, () => void distributors.refetch()) : null}
          total={distributors.data?.total}
          empty="None. This employee sees no distributor until one is assigned."
          rows={(distributors.data?.items ?? []).map((d) => ({ id: d.id, name: d.name, href: `/distributors/${d.id}` }))}
        />
        <List
          title="Doctors"
          loading={doctors.isLoading}
          error={doctors.error ? toErrorState(doctors.error, () => void doctors.refetch()) : null}
          total={doctors.data?.total}
          empty="No doctors assigned."
          rows={(doctors.data?.items ?? []).map((d) => ({ id: d.id, name: d.name, href: `/doctors/${d.id}` }))}
        />
        <List
          title="Chemists (via routes)"
          loading={chemistsLoading}
          error={null}
          total={chemistsLoading ? undefined : chemists.length}
          empty="No chemists on this employee's routes."
          rows={chemists.map((c) => ({ id: c.id, name: c.name, href: `/chemists/${c.id}` }))}
        />
      </div>
    </Card>
  );
}

function List({ title, loading, error, total, empty, rows }: { title: string; loading: boolean; error: ReturnType<typeof toErrorState> | null; total: number | undefined; empty: string; rows: Array<{ id: string; name: string; href: string }> }) {
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-semibold text-text">
        {title}
        {total !== undefined ? <span className="ml-1.5 font-normal text-text-muted">{total}</span> : null}
      </h3>
      <DataState isLoading={loading} error={error} isEmpty={rows.length === 0} empty={{ title: empty, description: '' }}>
        <ul className="space-y-1 text-[13px]">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="text-text hover:text-accent hover:underline">
                {r.name}
              </Link>
            </li>
          ))}
        </ul>
      </DataState>
    </div>
  );
}
