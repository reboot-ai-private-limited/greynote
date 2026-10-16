'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { assignmentsApi, type UserRouteDto } from '@/lib/api/endpoints/territory';
import { toErrorState } from '@/lib/api/toErrorState';
import { keys } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import { RouteChecklist } from '@/features/territory/components/RouteChecklist';
import { useActiveRoutes } from '@/features/territory/hooks/useRoutes';
import { useUnassignMr } from '@/features/territory/hooks/useRouteMutations';
import { useUserRoutes } from '@/features/territory/hooks/useUserRoutes';

/** The routes a field employee covers, changed from here (Admin): add one, or remove one. The same assignments as the route's own page. */
export function RoutesSection({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const routes = useUserRoutes(user.id);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<UserRouteDto | null>(null);
  const unassign = useUnassignMr(removing?.id ?? '', () => setRemoving(null));

  const columns: readonly Column<UserRouteDto>[] = [
    { key: 'name', header: 'Route', render: (r) => r.name },
    { key: 'type', header: 'Type', render: (r) => r.routeType },
    { key: 'km', header: 'Km', render: (r) => r.distanceKm ?? '—' },
    ...(readOnly
      ? []
      : [
          {
            key: 'actions',
            header: '',
            render: (r: UserRouteDto) => (
              <Button size="sm" variant="secondary" onClick={() => setRemoving(r)}>
                Remove
              </Button>
            ),
          },
        ]),
  ];

  return (
    <Card
      title="Routes"
      description="The routes this MR works. They appear on the MR's phone when planning a day."
      actions={
        readOnly ? null : (
          <Button size="sm" onClick={() => setAdding(true)}>
            Add route
          </Button>
        )
      }
    >
      <DataState
        isLoading={routes.isLoading}
        error={routes.error ? toErrorState(routes.error, () => void routes.refetch()) : null}
        isEmpty={routes.data?.length === 0}
        empty={{
          title: 'No routes assigned',
          description: 'Add a route to put it on this MR’s app.',
        }}
      >
        <DataTable columns={columns} rows={routes.data ?? []} rowKey={(r) => r.id} />
      </DataState>
      {adding ? (
        <AddRouteDialog
          userId={user.id}
          assignedIds={new Set((routes.data ?? []).map((r) => r.id))}
          onClose={() => setAdding(false)}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove route"
        description={`${user.name} will no longer have ${removing?.name ?? 'this route'}. The assignment stays in the route's history.`}
        confirmLabel="Remove"
        pending={unassign.isPending}
        onConfirm={() => removing && unassign.mutate(user.id)}
      />
    </Card>
  );
}

function AddRouteDialog({
  userId,
  assignedIds,
  onClose,
}: {
  userId: string;
  assignedIds: ReadonlySet<string>;
  onClose: () => void;
}) {
  const routes = useActiveRoutes();
  const [selected, setSelected] = useState<string[]>([]);
  const assign = useApiMutation<string[]>({
    // One by one: a route that fails stops the rest, and the ones before it stay added.
    call: async (token, routeIds) => {
      for (const routeId of routeIds) await assignmentsApi.assign(token, routeId, userId);
    },
    invalidates: [keys.routes.all()],
    successMessage: 'Routes added.',
    onSuccess: onClose,
  });
  const candidates = (routes.data ?? []).filter((r) => !assignedIds.has(r.id));

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Add routes"
      description="Tick one or more routes."
    >
      {routes.isLoading ? (
        <p className="text-[13px] text-text-subtle">Loading…</p>
      ) : (
        <RouteChecklist
          routes={candidates}
          selected={selected}
          onChange={setSelected}
          emptyText="No more routes to add."
        />
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={selected.length === 0 || assign.isPending}
          onClick={() => assign.mutate(selected)}
        >
          {selected.length > 1 ? `Add ${selected.length} routes` : 'Add route'}
        </Button>
      </div>
    </Dialog>
  );
}
