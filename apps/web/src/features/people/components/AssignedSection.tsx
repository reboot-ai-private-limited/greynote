'use client';

import type { DistributorDto, UserDetailDto } from '@greynote/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { toErrorState } from '@/lib/api/toErrorState';
import { useDistributors, useUpdateDistributor } from '@/features/field-master-data/hooks/useDistributors';
import { useChemists, useUnassignChemist } from '@/features/field-master-data/hooks/useChemists';
import { useDoctors, useUnassignDoctor } from '@/features/field-master-data/hooks/useDoctors';
import { moreText, removeWording, type Holder } from '../lib/assigned';

/** The first few of each kind; the rest are one click away on the list page, already filtered to this employee. */
const SHOWN = 5;
const PAGE = { page: 1, pageSize: SHOWN } as const;

/**
 * What a field employee is responsible for (Admin): the distributors, doctors and chemists assigned to them, and to anyone below them (decision-log
 * 2026-11-19: a manager holds what their team holds, as on the phone). Each row says who actually holds it, the list ends in "+N more · View all" (the
 * list page filtered to this employee), and Remove takes it off whoever holds it. It is changed on its own page too.
 */
export function AssignedSection({ user }: { user: UserDetailDto }) {
  const distributors = useDistributors({ ...PAGE, assignedUserId: user.id, status: 'active' });
  const doctors = useDoctors({ ...PAGE, assignedUserId: user.id });
  const chemists = useChemists({ ...PAGE, assignedUserId: user.id });

  return (
    <Card title="Assigned" description="Distributors, doctors and chemists this employee holds, and what the people below them hold. Each says who holds it; Remove takes it off that person.">
      <div className="grid gap-6 p-5 md:grid-cols-3">
        <Block
          title="Distributors"
          loading={distributors.isLoading}
          error={distributors.error ? toErrorState(distributors.error, () => void distributors.refetch()) : null}
          total={distributors.data?.total}
          empty="None. Nobody on this employee's team holds a distributor."
          viewAll={`/distributors?assignedUserId=${user.id}`}
        >
          {(distributors.data?.items ?? []).map((d) => (
            <DistributorRow key={d.id} d={d} user={user} />
          ))}
        </Block>
        <Block
          title="Doctors"
          loading={doctors.isLoading}
          error={doctors.error ? toErrorState(doctors.error, () => void doctors.refetch()) : null}
          total={doctors.data?.total}
          empty="No doctors held by this employee or their team."
          viewAll={`/doctors?assignedUserId=${user.id}`}
        >
          {(doctors.data?.items ?? []).map((d) => (
            <DoctorRow key={d.id} id={d.id} name={d.name} holder={d.assignedTo} user={user} />
          ))}
        </Block>
        <Block
          title="Chemists"
          loading={chemists.isLoading}
          error={chemists.error ? toErrorState(chemists.error, () => void chemists.refetch()) : null}
          total={chemists.data?.total}
          empty="None. Nobody on this employee's team holds a chemist."
          viewAll={`/chemists?assignedUserId=${user.id}`}
        >
          {(chemists.data?.items ?? []).map((c) => (
            <ChemistRow key={c.id} id={c.id} name={c.name} holders={c.assignedTo ?? []} user={user} />
          ))}
        </Block>
      </div>
    </Card>
  );
}

function Block({ title, loading, error, total, empty, viewAll, children }: { title: string; loading: boolean; error: ReturnType<typeof toErrorState> | null; total: number | undefined; empty: string; viewAll: string; children: React.ReactNode }) {
  const more = moreText(total ?? 0, SHOWN);
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-semibold text-text">
        {title}
        {total !== undefined ? <span className="ml-1.5 font-normal text-text-muted">{total}</span> : null}
      </h3>
      <DataState isLoading={loading} error={error} isEmpty={(total ?? 0) === 0} empty={{ title: empty, description: '' }}>
        <ul className="space-y-2 text-[13px]">{children}</ul>
        {more ? (
          <Link href={viewAll} className="mt-2 inline-block text-[13px] font-medium text-accent hover:underline">
            {more} · View all
          </Link>
        ) : null}
      </DataState>
    </div>
  );
}

/** A name, who holds it, and a Remove that takes it off that holder (asks first). */
function Row({ href, name, holders, user, pending, canRemove, onRemove }: { href: string; name: string; holders: Holder[]; user: UserDetailDto; pending: boolean; canRemove: boolean; onRemove: (holder: Holder) => void }) {
  const [asking, setAsking] = useState(false);
  const single = holders.length === 1 ? holders[0]! : null;
  const wording = single ? removeWording(name, single, { id: user.id, name: user.name }) : null;
  return (
    <li>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={href} className="text-text hover:text-accent hover:underline">
            {name}
          </Link>
          {holders.length > 0 ? <p className="text-[12px] text-text-subtle">Held by {holders.map((h) => `${h.name} (${h.employeeCode})`).join(', ')}</p> : null}
        </div>
        {canRemove && single ? (
          <Button variant="ghost" size="sm" onClick={() => setAsking(true)}>
            Remove
          </Button>
        ) : holders.length > 1 ? (
          <Link href={href} className="shrink-0 text-[12px] text-accent hover:underline">
            Several hold it
          </Link>
        ) : null}
      </div>
      {wording ? (
        <ConfirmDialog
          open={asking}
          onOpenChange={setAsking}
          title={wording.title}
          description={wording.description}
          confirmLabel="Remove"
          pending={pending}
          onConfirm={() => {
            onRemove(single!);
            setAsking(false);
          }}
        />
      ) : null}
    </li>
  );
}

function DoctorRow({ id, name, holder, user }: { id: string; name: string; holder: Holder | null; user: UserDetailDto }) {
  const unassign = useUnassignDoctor(id, () => undefined);
  return <Row href={`/doctors/${id}`} name={name} holders={holder ? [holder] : []} user={user} pending={unassign.isPending} canRemove={holder !== null} onRemove={(h) => unassign.mutate(h.userId)} />;
}

function ChemistRow({ id, name, holders, user }: { id: string; name: string; holders: Holder[]; user: UserDetailDto }) {
  const unassign = useUnassignChemist(id, () => undefined);
  return <Row href={`/chemists/${id}`} name={name} holders={holders} user={user} pending={unassign.isPending} canRemove onRemove={(h) => unassign.mutate(h.userId)} />;
}

function DistributorRow({ d, user }: { d: DistributorDto; user: UserDetailDto }) {
  const update = useUpdateDistributor();
  const holders = d.assignedTo ?? [];
  return (
    <Row
      href={`/distributors/${d.id}`}
      name={d.name}
      holders={holders}
      user={user}
      pending={update.isPending}
      canRemove
      onRemove={(h) => update.mutate({ id: d.id, body: { assignedUserIds: d.assignedUserIds.filter((id) => id !== h.userId) } })}
    />
  );
}
