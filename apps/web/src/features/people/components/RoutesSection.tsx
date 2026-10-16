'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { assignmentsApi, type UserRouteDto } from '@/lib/api/endpoints/territory';
import { toErrorState } from '@/lib/api/toErrorState';
import { keys } from '@/lib/query/keys';
import { useApiMutation } from '@/lib/query/mutation';
import { RouteChecklist } from '@/features/territory/components/RouteChecklist';
import { useActiveRoutes } from '@/features/territory/hooks/useRoutes';
import { useUnassignMr } from '@/features/territory/hooks/useRouteMutations';
import { useUserRoutes } from '@/features/territory/hooks/useUserRoutes';
import { useManagerCoverage } from '@/features/territory/hooks/useManagerCoverage';
import { useDesignations } from '../hooks/useMasterData';
import { useRouteScope } from '../hooks/useRouteScope';
import { territoryRule } from '../lib/territoryRules';

/** The routes a field employee covers, changed from here (Admin): add one, or remove one. The same assignments as the route's own page. */
export function RoutesSection({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const designations = useDesignations();
  const designation = designations.data?.find((d) => d.id === user.profile?.designationId)?.name;
  // A ZSM or NSM holds no routes of their own.
  if (territoryRule(designation).routes === 'none') return null;
  return <RoutesCard user={user} readOnly={readOnly} />;
}

function RoutesCard({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const routes = useUserRoutes(user.id);
  const coverage = useManagerCoverage(user.id);
  const allRoutes = useActiveRoutes();
  // A reminder, not an automatic add: a route created later under a covered HQ is not given to anyone until someone chooses it.
  const unassigned = (allRoutes.data ?? []).filter(
    (r) =>
      (coverage.data?.hqIds ?? []).includes(r.hqId) &&
      !(routes.data ?? []).some((a) => a.id === r.id),
  );
  const addAll = useApiMutation<string[]>({
    call: async (token, ids) => {
      for (const id of ids) await assignmentsApi.assign(token, id, user.id);
    },
    invalidates: [keys.routes.all()],
    successMessage: 'Routes added.',
  });
  const scope = useRouteScope(user);
  const outside = (routes.data ?? []).filter((r) => !scope.inScope(r.hqId));
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<UserRouteDto | null>(null);
  const unassign = useUnassignMr(removing?.id ?? '', () => setRemoving(null));

  const columns: readonly Column<UserRouteDto>[] = [
    {
      key: 'name',
      header: 'Route',
      render: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          {r.name}
          {scope.inScope(r.hqId) ? null : <Badge tone="warning">Outside {scope.label}</Badge>}
        </span>
      ),
    },
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
      {!readOnly && unassigned.length > 0 && !routes.isLoading ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-accent-soft px-5 py-2.5 text-[13px] text-accent-soft-text"
        >
          <span>
            {unassigned.length} route{unassigned.length === 1 ? '' : 's'} under{' '}
            {unassigned.length === 1 ? 'an HQ' : 'HQs'} this employee covers{' '}
            {unassigned.length === 1 ? 'is' : 'are'} not assigned yet.
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={addAll.isPending}
              onClick={() => setAdding(true)}
            >
              Choose
            </Button>
            <Button
              size="sm"
              disabled={addAll.isPending}
              onClick={() => addAll.mutate(unassigned.map((r) => r.id))}
            >
              Add all {unassigned.length}
            </Button>
          </span>
        </div>
      ) : null}
      {outside.length > 0 ? (
        <p
          role="status"
          className="border-b border-border bg-warning-bg px-5 py-2.5 text-[13px] text-warning-fg"
        >
          {outside.length} of these routes {outside.length === 1 ? 'is' : 'are'} outside{' '}
          {scope.label}. They still work; check they are meant to be here.
        </p>
      ) : null}
      <DataState
        isLoading={routes.isLoading}
        error={routes.error ? toErrorState(routes.error, () => void routes.refetch()) : null}
        isEmpty={routes.data?.length === 0}
        empty={{
          title: 'No routes assigned',
          description: 'Add a route to put it on this MR’s app.',
        }}
      >
        <DataTable bleed={false} columns={columns} rows={routes.data ?? []} rowKey={(r) => r.id} />
      </DataState>
      {adding ? (
        <AddRouteDialog
          user={user}
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
  user,
  assignedIds,
  onClose,
}: {
  user: UserDetailDto;
  assignedIds: ReadonlySet<string>;
  onClose: () => void;
}) {
  const userId = user.id;
  // Routes that suit the employee first; the rest only on request, and flagged. Nothing is refused.
  const scope = useRouteScope(user);
  const [showOutside, setShowOutside] = useState(false);
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
  const free = (routes.data ?? []).filter((r) => !assignedIds.has(r.id));
  const candidates =
    scope.unlimited || showOutside ? free : free.filter((r) => scope.inScope(r.hqId));
  const hiddenCount = free.length - candidates.length;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Add routes"
      description={
        scope.unlimited || showOutside
          ? 'Tick one or more routes.'
          : `Routes of ${scope.label}. Tick one or more.`
      }
    >
      {!scope.unlimited ? (
        <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-text-muted">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent)]"
            checked={showOutside}
            onChange={(e) => setShowOutside(e.target.checked)}
          />
          Also show routes outside {scope.label}
          {!showOutside && hiddenCount > 0 ? ` (${hiddenCount})` : ''}
        </label>
      ) : null}
      {routes.isLoading ? (
        <p className="text-[13px] text-text-subtle">Loading…</p>
      ) : (
        <RouteChecklist
          routes={candidates}
          selected={selected}
          onChange={setSelected}
          flag={(r) => (scope.inScope(r.hqId) ? null : `Outside ${scope.label}`)}
          emptyText={
            scope.unlimited || showOutside
              ? 'No more routes to add.'
              : 'No more routes under this scope. Tick “Also show routes outside”, or create one under Territory → Routes.'
          }
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
