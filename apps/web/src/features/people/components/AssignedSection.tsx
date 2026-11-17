'use client';

import type { UserDetailDto } from '@greynote/contracts';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { toErrorState } from '@/lib/api/toErrorState';
import { useDistributors } from '@/features/field-master-data/hooks/useDistributors';
import { useChemists } from '@/features/field-master-data/hooks/useChemists';
import { useDoctors } from '@/features/field-master-data/hooks/useDoctors';

const PAGE = { page: 1, pageSize: 100 } as const;

/**
 * What a field employee is responsible for, read only (Admin): the distributors, doctors and chemists assigned to them.
 * Each is changed on its own page.
 */
export function AssignedSection({ user }: { user: UserDetailDto }) {
  const distributors = useDistributors({ ...PAGE, assignedUserId: user.id, status: 'active' });
  const doctors = useDoctors({ ...PAGE, assignedUserId: user.id });
  const chemists = useChemists({ ...PAGE, assignedUserId: user.id });

  return (
    <Card title="Assigned" description="Distributors, doctors and chemists handed to this employee. Change them from the distributor, doctor or chemist page.">
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
          title="Chemists"
          loading={chemists.isLoading}
          error={chemists.error ? toErrorState(chemists.error, () => void chemists.refetch()) : null}
          total={chemists.data?.total}
          empty="None. This employee sees no chemist until one is assigned."
          rows={(chemists.data?.items ?? []).map((c) => ({ id: c.id, name: c.name, href: `/chemists/${c.id}` }))}
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
