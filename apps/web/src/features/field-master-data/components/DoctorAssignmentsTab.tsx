'use client';

import type { DoctorDto } from '@greynote/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { Dialog } from '@/components/ui/Dialog';
import { useRouteAssignments } from '@/features/territory/hooks/useRouteAssignments';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate } from '@/lib/format';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAssignDoctor, useDoctorAssignments, useUnassignDoctor } from '../hooks/useDoctors';
import { assignableMrs } from '../lib/samples';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';

/** Who is responsible for this doctor now, who has been, and the way to change it. */
export function DoctorAssignmentsTab({ doctor }: { doctor: DoctorDto }) {
  const readOnly = useIsReadOnly();
  const history = useDoctorAssignments(doctor.id);
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const unassign = useUnassignDoctor(doctor.id, () => setRemoving(false));
  const current = doctor.assignedTo;
  // An assignment needs an active doctor (the API refuses otherwise); say so rather than offer a button that fails.
  const canAssign = doctor.status === 'active';

  return (
    <div className="space-y-6">
      <Card
        title="Responsible MR"
        description="The one MR who can visit this doctor, give it samples and mark its gifts done. Choosing another replaces them."
      >
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-sm text-text">
            {current ? `${current.name} (${current.employeeCode})` : <span className="text-text-subtle">Nobody is responsible for this doctor.</span>}
          </p>
          <div className="flex items-center gap-2">
            <Button
              disabled={readOnly || !canAssign}
              title={readOnly ? 'A past financial year is read-only' : !canAssign ? 'Only an active doctor can be assigned' : undefined}
              onClick={() => setPicking(true)}
            >
              {current ? 'Change MR' : 'Assign an MR'}
            </Button>
            {current ? (
              <Button variant="secondary" disabled={readOnly} onClick={() => setRemoving(true)}>
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        {!canAssign ? (
          <p className="border-t border-border px-5 py-3 text-[13px] text-text-subtle">
            {doctor.status === 'pending' ? 'This doctor is awaiting approval; it can be assigned once approved.' : 'This doctor is inactive; reactivate it to assign an MR.'}
          </p>
        ) : null}
      </Card>

      <Card title="History" description="Every MR who has been responsible, newest first.">
        <DataState
          isLoading={history.isLoading}
          error={history.error ? toErrorState(history.error, () => void history.refetch()) : null}
          isEmpty={history.data?.length === 0}
          empty={{ title: 'No assignments yet' }}
        >
          <ul className="divide-y divide-border">
            {(history.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">
                    <EmployeeName userId={a.userId} />
                  </p>
                  <p className="text-xs text-text-subtle">
                    From {formatDate(a.assignedAt)}
                    {a.unassignedAt ? ` to ${formatDate(a.unassignedAt)}` : ''} · set by <EmployeeName userId={a.assignedBy} />
                  </p>
                </div>
                <Badge tone={a.status === 'active' ? 'success' : 'neutral'}>{a.status === 'active' ? 'Current' : 'Ended'}</Badge>
              </li>
            ))}
          </ul>
        </DataState>
      </Card>

      {picking ? <AssignDialog doctor={doctor} onClose={() => setPicking(false)} /> : null}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remove the responsible MR"
        description="Nobody will be responsible for this doctor until you assign someone. Visits already logged are unchanged."
        confirmLabel="Remove"
        pending={unassign.isPending}
        onConfirm={() => current && unassign.mutate(current.userId)}
      />
    </div>
  );
}

/** Offers only the MRs who have this doctor's route, since the API refuses anyone else. */
function AssignDialog({ doctor, onClose }: { doctor: DoctorDto; onClose: () => void }) {
  const routeAssignments = useRouteAssignments(doctor.routeId, false);
  const assign = useAssignDoctor(doctor.id, onClose);
  const candidates = assignableMrs(routeAssignments.data ?? [], doctor.assignedTo?.userId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Choose the responsible MR" description="MRs who cover this doctor's route.">
      <div aria-live="polite" className="max-h-72 overflow-y-auto">
        {routeAssignments.isLoading ? (
          <p className="text-[13px] text-text-subtle">Loading…</p>
        ) : routeAssignments.error ? (
          <p role="alert" className="text-[13px] text-danger-fg">{toErrorState(routeAssignments.error).message}</p>
        ) : candidates.length === 0 ? (
          <p className="text-[13px] text-text-muted">
            No other MR has this route yet. Assign the route to an MR first, on the{' '}
            <Link href={`/routes/${doctor.routeId}`} className="text-accent hover:underline">
              route page
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {candidates.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{m.name}</p>
                  <p className="text-xs text-text-subtle">{m.employeeCode}</p>
                </div>
                <Button size="sm" disabled={assign.isPending} onClick={() => assign.mutate(m.userId)}>
                  Assign
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
