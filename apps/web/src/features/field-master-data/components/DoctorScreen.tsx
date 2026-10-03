'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useDoctor, useUpdateDoctor } from '../hooks/useDoctors';
import { DOCTOR_STATUS_LABEL, DOCTOR_STATUS_TONE, canToggleStatus, locationWasCorrected } from '../lib/doctors';
import { DoctorDetailsForm } from './DoctorDetailsForm';

/** `/doctors/new` (no id) and `/doctors/[id]`. */
export function DoctorScreen({ id }: { id?: string }) {
  const query = useDoctor(id ?? '');
  const back = (
    <p className="mb-2 text-sm">
      <Link href="/doctors" className="text-text-muted hover:text-accent hover:underline">
        ← Doctors
      </Link>
    </p>
  );
  if (!id) {
    return (
      <>
        {back}
        <PageHeader title="New doctor" description="A doctor on a route, active at once. The location can be set now or later." />
        <DoctorDetailsForm />
      </>
    );
  }
  return (
    <>
      {back}
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={!query.data}
        empty={{ title: 'Doctor not found' }}
        skeleton={
          <div role="status" aria-label="Loading" className="space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        {query.data ? <DoctorDetail doctor={query.data} /> : null}
      </DataState>
    </>
  );
}

function DoctorDetail({ doctor }: { doctor: NonNullable<ReturnType<typeof useDoctor>['data']> }) {
  const readOnly = useIsReadOnly();
  const directory = useTerritoryDirectory();
  const [toggling, setToggling] = useState(false);
  const toggle = useUpdateDoctor(() => setToggling(false));

  return (
    <>
      <PageHeader
        title={doctor.name}
        description={`${doctor.specialty} · ${directory.routeLabel(doctor.routeId)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={DOCTOR_STATUS_TONE[doctor.status]}>{DOCTOR_STATUS_LABEL[doctor.status]}</Badge>
            {canToggleStatus(doctor.status) ? (
              <Button variant="secondary" disabled={readOnly} onClick={() => setToggling(true)}>
                {doctor.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </Button>
            ) : null}
          </div>
        }
      />
      {doctor.status === 'pending' ? (
        <div role="status" className="mb-6 rounded-lg border border-border bg-warning-bg p-4 text-sm text-warning-fg">
          <p className="font-medium">An MR added this doctor, and it is waiting for approval.</p>
          <p className="mt-1">
            Nobody can visit it or give it samples until it is approved. Check the location below against the grey pin (where the phone was),
            correct it if needed, then approve or reject it from the Approvals queue.
          </p>
        </div>
      ) : null}
      {doctor.status === 'inactive' ? (
        <p role="status" className="mb-6 rounded-lg border border-border bg-surface-subtle p-4 text-sm text-text-muted">
          This doctor is inactive. Reactivate it to change it.
        </p>
      ) : null}
      {locationWasCorrected(doctor) ? (
        <p className="mb-6 text-sm text-text-muted">The registered location was corrected after the MR added this doctor; the phone&apos;s own point is kept for reference.</p>
      ) : null}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="mt-6">
          {/* Keyed by what was loaded, so the draft starts from the latest data after a save. */}
          <DoctorDetailsForm key={JSON.stringify(doctor)} doctor={doctor} />
        </TabsContent>
      </Tabs>
      {canToggleStatus(doctor.status) ? (
        <StatusToggleDialog
          item={toggling ? { id: doctor.id, name: doctor.name, status: doctor.status === 'active' ? 'active' : 'inactive' } : null}
          noun="doctor"
          pending={toggle.isPending}
          onClose={() => setToggling(false)}
          onConfirm={(status) => toggle.mutate({ id: doctor.id, body: { status } })}
        />
      ) : null}
    </>
  );
}
