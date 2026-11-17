'use client';

import type { ChemistDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate } from '@/lib/format';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { EmployeeName } from '@/features/people/components/EmployeePickerField';
import { useChemistAssignments, useSetChemistHolders, useUnassignChemist } from '../hooks/useChemists';
import { PeoplePickerDialog } from './PeoplePickerDialog';

/**
 * Who holds this chemist (Admin). Many MRs can hold one; each sees it on their phone, and their managers see it in the team's chemists.
 * The route no longer decides, so the picker offers any active field employee.
 */
export function ChemistAssignmentsCard({ chemist }: { chemist: ChemistDto }) {
  const readOnly = useIsReadOnly();
  const rows = useChemistAssignments(chemist.id);
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const holders = (rows.data ?? []).filter((a) => a.status === 'active');
  const set = useSetChemistHolders(chemist.id, () => setPicking(false));
  const unassign = useUnassignChemist(chemist.id, () => setRemoving(null));
  // Only an active chemist can be assigned (the API refuses otherwise); say so rather than offer a button that fails.
  const canAssign = chemist.status === 'active';

  return (
    <>
      <Card
        title="Assigned MRs"
        description="The MRs who can see, call on and order for this chemist. Any number of MRs can hold one; their managers see it through them."
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <p className="text-[13px] text-text-muted">{holders.length === 0 ? 'Nobody holds this chemist yet.' : `${holders.length} MR${holders.length === 1 ? '' : 's'}`}</p>
          <Button
            disabled={readOnly || !canAssign}
            title={readOnly ? 'A past financial year is read-only' : !canAssign ? 'Only an active chemist can be assigned' : undefined}
            onClick={() => setPicking(true)}
          >
            Add or remove MRs
          </Button>
        </div>
        <DataState
          isLoading={rows.isLoading}
          error={rows.error ? toErrorState(rows.error, () => void rows.refetch()) : null}
          isEmpty={rows.data?.length === 0}
          empty={{ title: 'No assignments yet' }}
        >
          <ul className="divide-y divide-border">
            {(rows.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">{a.user ? `${a.user.name} (${a.user.employeeCode})` : <EmployeeName userId={a.userId} />}</p>
                  <p className="text-xs text-text-subtle">
                    From {formatDate(a.assignedAt)}
                    {a.unassignedAt ? ` to ${formatDate(a.unassignedAt)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={a.status === 'active' ? 'success' : 'neutral'}>{a.status === 'active' ? 'Current' : 'Ended'}</Badge>
                  {a.status === 'active' ? (
                    <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => setRemoving(a.userId)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </DataState>
      </Card>
      {picking ? (
        <PeoplePickerDialog
          chosen={holders.map((h) => h.userId)}
          onClose={() => setPicking(false)}
          onDone={(ids) =>
            set.mutate({
              add: ids.filter((id) => !holders.some((h) => h.userId === id)),
              remove: holders.map((h) => h.userId).filter((id) => !ids.includes(id)),
            })
          }
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this MR"
        description="They will stop seeing this chemist, and their manager will no longer see it through them. Other MRs who hold it keep it. Calls already logged are unchanged."
        confirmLabel="Remove"
        pending={unassign.isPending}
        onConfirm={() => removing && unassign.mutate(removing)}
      />
    </>
  );
}
