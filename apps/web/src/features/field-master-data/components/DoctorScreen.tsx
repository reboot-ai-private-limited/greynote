'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { DOCTOR_STATUS_LABEL, DOCTOR_STATUS_TONE, canToggleStatus, locationWasCorrected, pendingApprovalHref } from '../lib/doctors';
import { DoctorAssignmentsTab } from './DoctorAssignmentsTab';
import { DoctorDetailsForm } from './DoctorDetailsForm';
import { DoctorVisitsTab } from './DoctorVisitsTab';
import { DoctorSamplesTab } from './DoctorSamplesTab';
import { RetireDoctorDialog } from './RetireDoctorDialog';
import { DoctorVisualsTab } from '@/features/marketing/components/DoctorVisualsTab';

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
      <DoctorDetailsForm />
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
  const router = useRouter();
  const [reactivating, setReactivating] = useState(false);
  const [retiring, setRetiring] = useState<'deactivate' | 'delete' | null>(null);
  const toggle = useUpdateDoctor(() => setReactivating(false));

  return (
    <>
      <PageHeader
        title={doctor.name}
        description={`${doctor.specialty} · ${directory.routeLabel(doctor.routeId)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={DOCTOR_STATUS_TONE[doctor.status]}>{DOCTOR_STATUS_LABEL[doctor.status]}</Badge>
            {canToggleStatus(doctor.status) ? (
              <>
                <Button variant="secondary" disabled={readOnly} onClick={() => (doctor.status === 'active' ? setRetiring('deactivate') : setReactivating(true))}>
                  {doctor.status === 'active' ? 'Deactivate' : 'Reactivate'}
                </Button>
                <Button variant="danger" disabled={readOnly} onClick={() => setRetiring('delete')}>
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      {doctor.status === 'pending' ? (
        <div role="status" className="mb-6 rounded-lg border border-border bg-warning-bg p-4 text-sm text-warning-fg">
          <p className="font-medium">An MR added this doctor, and it is waiting for approval.</p>
          <p className="mt-1">
            Nobody can visit it or give it samples until it is approved. Check the location below against the grey pin (where the phone was),
            correct it if needed, then approve or reject it from the{' '}
            <Link href={pendingApprovalHref(doctor)} className="font-medium underline">
              {doctor.approvalRequestId ? 'its approval request' : 'Approvals queue'}
            </Link>
            .
          </p>
        </div>
      ) : null}
      {doctor.status === 'inactive' ? (
        <p role="status" className="mb-6 rounded-lg border border-border bg-surface-subtle p-4 text-sm text-text-muted">
          This doctor is inactive: nobody visits it and it has no MR. Its details can still be corrected; reactivate it to assign an MR again.
        </p>
      ) : null}
      {locationWasCorrected(doctor) ? (
        <p className="mb-6 text-sm text-text-muted">The registered location was corrected after the MR added this doctor; the phone&apos;s own point is kept for reference.</p>
      ) : null}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="assignment">Responsible MR</TabsTrigger>
          <TabsTrigger value="visits">Visits</TabsTrigger>
          <TabsTrigger value="samples">Samples</TabsTrigger>
          <TabsTrigger value="visuals">Visuals</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="mt-6">
          {/* Keyed by what the form edits (not who is assigned), so a save refreshes the draft but changing the MR does not wipe unsaved edits. */}
          <DoctorDetailsForm key={JSON.stringify({ ...doctor, assignedTo: null })} doctor={doctor} />
        </TabsContent>
        <TabsContent value="assignment" className="mt-6">
          <DoctorAssignmentsTab doctor={doctor} />
        </TabsContent>
        <TabsContent value="visits" className="mt-6">
          <DoctorVisitsTab doctor={doctor} />
        </TabsContent>
        <TabsContent value="samples" className="mt-6">
          <DoctorSamplesTab doctor={doctor} />
        </TabsContent>
        <TabsContent value="visuals" className="mt-6">
          <DoctorVisualsTab doctorId={doctor.id} />
        </TabsContent>
      </Tabs>
      {doctor.status === 'inactive' ? (
        <StatusToggleDialog
          item={reactivating ? { id: doctor.id, name: doctor.name, status: 'inactive' } : null}
          noun="doctor"
          pending={toggle.isPending}
          onClose={() => setReactivating(false)}
          onConfirm={(status) => toggle.mutate({ id: doctor.id, body: { status } })}
        />
      ) : null}
      {retiring ? (
        <RetireDoctorDialog action={retiring} doctor={doctor} onClose={() => setRetiring(null)} onDeleted={() => router.push('/doctors')} />
      ) : null}
    </>
  );
}
