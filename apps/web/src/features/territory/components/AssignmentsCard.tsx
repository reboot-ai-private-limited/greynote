'use client';

import type { RouteAssignmentDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate } from '@/lib/format';
import { useRouteAssignments } from '../hooks/useRouteAssignments';
import { useUnassignMr } from '../hooks/useRouteMutations';
import { AssignMrDialog } from './AssignMrDialog';

/** MRs assigned to a route. A route can have many MRs and an MR many routes; history is kept. */
export function AssignmentsCard({
  routeId,
  routeActive,
  readOnly,
}: {
  routeId: string;
  routeActive: boolean;
  readOnly: boolean;
}) {
  const [history, setHistory] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [unassigning, setUnassigning] = useState<RouteAssignmentDto | null>(null);
  const rows = useRouteAssignments(routeId, history);
  const active = useRouteAssignments(routeId, false);
  const unassign = useUnassignMr(routeId, () => setUnassigning(null));
  const assignedIds = new Set((active.data ?? []).map((a) => a.userId));

  const columns: readonly Column<RouteAssignmentDto>[] = [
    {
      key: 'name',
      header: 'MR',
      render: (a) => <span className="font-medium">{a.user?.name ?? '—'}</span>,
    },
    { key: 'code', header: 'Code', render: (a) => a.user?.employeeCode ?? '—' },
    { key: 'since', header: 'Assigned', render: (a) => formatDate(a.assignedAt) },
    {
      key: 'status',
      header: 'Status',
      render: (a) =>
        a.status === 'active' ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <Badge>{`Unassigned ${a.unassignedAt ? formatDate(a.unassignedAt) : ''}`.trim()}</Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-28 text-right',
      render: (a) =>
        a.status === 'active' ? (
          <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setUnassigning(a)}>
            Unassign
          </Button>
        ) : null,
    },
  ];

  return (
    <Card
      flat
      title="Assigned MRs"
      description="Who works this route."
      actions={
        <Button
          size="sm"
          disabled={readOnly || !routeActive}
          title={!routeActive ? 'Reactivate the route to assign MRs' : undefined}
          onClick={() => setAssigning(true)}
        >
          Assign MR
        </Button>
      }
    >
      <div className="mb-3">
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input
            type="checkbox"
            checked={history}
            onChange={(e) => setHistory(e.target.checked)}
            className="size-4 accent-accent"
          />
          Show history (unassigned MRs)
        </label>
      </div>
      <DataState
        isLoading={rows.isLoading}
        error={rows.error ? toErrorState(rows.error, () => void rows.refetch()) : null}
        isEmpty={rows.data?.length === 0}
        empty={{
          title: 'No MRs assigned',
          description: 'Assign an MR to put this route on their app.',
        }}
      >
        <DataTable columns={columns} rows={rows.data ?? []} rowKey={(a) => a.id} />
      </DataState>
      {assigning ? (
        <AssignMrDialog
          routeId={routeId}
          assignedUserIds={assignedIds}
          onClose={() => setAssigning(false)}
        />
      ) : null}
      <ConfirmDialog
        open={unassigning !== null}
        onOpenChange={(open) => !open && setUnassigning(null)}
        title="Unassign MR"
        description={`${unassigning?.user?.name ?? 'This MR'} will no longer have this route. The assignment stays in history.`}
        confirmLabel="Unassign"
        pending={unassign.isPending}
        onConfirm={() => unassigning && unassign.mutate(unassigning.userId)}
      />
    </Card>
  );
}
