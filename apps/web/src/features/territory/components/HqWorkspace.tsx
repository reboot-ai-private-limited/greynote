'use client';

import type { PlaceDto, RouteDto } from '@greynote/contracts';
import { AlertTriangle, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Dialog } from '@/components/ui/Dialog';
import { ActionLinks } from '@/components/ui/RowActions';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAllHqs } from '../hooks/useHqs';
import { usePlaceDirectory, usePlaces, useUpdatePlace } from '../hooks/usePlaces';
import { useRoutesTouchingHq } from '../hooks/useRoutes';
import { useAllZones } from '../hooks/useZones';
import { ROUTE_TYPE_LABEL } from '../lib/draft';
import { buildHqWorkspace } from '../lib/hqWorkspace';
import { AddPlaceDialog } from './AddPlaceDialog';
import { AddRouteDialog } from './AddRouteDialog';
import { DeleteTerritoryDialog } from './DeleteTerritoryDialog';
import { PlaceRouteDialog, RouteStatusDialog, taText, type DialogMode } from './PlaceRouteDialog';
import { RoutePayPreview } from './RoutePayPreview';

const kmText = (r: RouteDto) => (r.distanceKm === null ? 'km not set' : `${r.distanceKm} km`);

/**
 * The chosen HQ on the Territory page (2026-11-27): its places — the HQ town at 0 km, every other place with the km and TA of its route
 * from the town — and every other route touching the HQ. Each row's actions are words: View (read-only, with Edit inside), Edit, Deactivate.
 */
export function HqWorkspace({ hqId }: { hqId: string }) {
  const readOnly = useIsReadOnly();
  const hqs = useAllHqs();
  const zones = useAllZones();
  const places = usePlaces({ hqId, page: 1, pageSize: 100 });
  const routes = useRoutesTouchingHq(hqId);
  const directory = usePlaceDirectory();
  const hq = hqs.data?.find((h) => h.id === hqId);
  const zone = zones.data?.find((z) => z.id === hq?.zoneId);
  const view = useMemo(() => buildHqWorkspace(places.data?.items ?? [], routes.data ?? []), [places.data, routes.data]);

  const [adding, setAdding] = useState(false);
  const [addingRoute, setAddingRoute] = useState<{ from?: string | undefined; to?: string | undefined; title?: string | undefined } | null>(null);
  const [opened, setOpened] = useState<{ routeId: string; mode: DialogMode } | null>(null);
  const [townDay, setTownDay] = useState(false);
  const [toggling, setToggling] = useState<PlaceDto | null>(null);
  const [togglingRoute, setTogglingRoute] = useState<RouteDto | null>(null);
  const [deletingRoute, setDeletingRoute] = useState<RouteDto | null>(null);
  const updatePlace = useUpdatePlace(() => setToggling(null));

  if (!hq) return hqs.isLoading ? <Skeleton className="h-80 w-full" /> : <p className="text-sm text-text-muted">That HQ no longer exists. Choose another on the left.</p>;
  const townName = view.town?.name ?? hq.name;
  const routeLabel = (r: RouteDto) => (r.fromPlaceId && r.toPlaceId ? `${directory.labelOf(r.fromPlaceId)} ↔ ${directory.labelOf(r.toPlaceId)}` : r.name);
  const placeToggle = (place: PlaceDto) =>
    place.status === 'active' ? { label: 'Deactivate', tone: 'danger' as const, onClick: () => setToggling(place) } : { label: 'Reactivate', onClick: () => setToggling(place) };

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-text">
          {hq.name}
          {hq.status !== 'active' ? <Badge tone="neutral">Inactive</Badge> : null}
        </h2>
        <p className="text-sm text-text-muted">
          {zone?.name ?? ''} · {view.counts.places} places · {view.counts.routes} routes
          {view.counts.missing > 0 ? (
            <span className="text-warning-fg">
              {' '}
              · {view.counts.missing} place{view.counts.missing === 1 ? '' : 's'} with no route
            </span>
          ) : null}
        </p>
      </div>

      <Card
        title="Places"
        description={`Each place's km from ${townName} is what a day trip there pays. View shows what a day there pays each grade.`}
        actions={
          <Button size="sm" disabled={readOnly || hq.status !== 'active'} onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-4" /> Place
          </Button>
        }
      >
        <DataState
          isLoading={places.isLoading || routes.isLoading}
          error={places.error ? toErrorState(places.error, () => void places.refetch()) : routes.error ? toErrorState(routes.error, () => void routes.refetch()) : null}
          isEmpty={view.places.length === 0}
          empty={{ title: 'No places yet', description: 'Add the towns and stations this HQ works in.' }}
          skeleton={<Skeleton className="h-40 w-full" />}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-text-subtle">
                <tr>
                  <th className="px-5 py-2">Place</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">From {townName}</th>
                  <th className="px-3 py-2">TA</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {view.places.map(({ place, townRoute }) => (
                  <tr key={place.id} className={place.status !== 'active' ? 'text-text-subtle' : ''}>
                    <td className="px-5 py-2.5 font-medium">
                      <span className="inline-flex items-center gap-2">
                        {place.name}
                        {place.isHqTown ? <Badge tone="accent">HQ town</Badge> : null}
                        {place.status !== 'active' ? <Badge tone="neutral">Inactive</Badge> : null}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{ROUTE_TYPE_LABEL[place.type]}</td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {place.isHqTown ? (
                        '0 km'
                      ) : townRoute ? (
                        <span className="inline-flex items-center gap-1.5">
                          {kmText(townRoute)}
                          {townRoute.status !== 'active' ? <Badge tone="neutral">Inactive</Badge> : null}
                        </span>
                      ) : place.status === 'active' ? (
                        <span className="inline-flex items-center gap-1.5 text-warning-fg">
                          <AlertTriangle aria-hidden className="size-4" /> No route
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2.5">{place.isHqTown ? <span className="text-text-subtle">No TA (HQ)</span> : townRoute ? taText(townRoute) : '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      <ActionLinks
                        label={place.name}
                        disabled={readOnly}
                        actions={
                          place.isHqTown
                            ? [{ label: 'View', alwaysOn: true, onClick: () => setTownDay(true) }]
                            : [
                                ...(townRoute
                                  ? [
                                      { label: 'View', alwaysOn: true, onClick: () => setOpened({ routeId: townRoute.id, mode: 'view' }) },
                                      { label: 'Edit', onClick: () => setOpened({ routeId: townRoute.id, mode: 'edit' }) },
                                    ]
                                  : [{ label: 'Add route', onClick: () => setAddingRoute({ from: view.town?.id, to: place.id, title: `${townName} ↔ ${place.name}` }) }]),
                                placeToggle(place),
                              ]
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </Card>

      <Card
        title="Other routes"
        description="Place ↔ place inside this HQ, and routes to other HQs (a manager plans those). Each works both ways."
        actions={
          <Button size="sm" variant="secondary" disabled={readOnly || hq.status !== 'active'} onClick={() => setAddingRoute({})}>
            <Plus aria-hidden className="size-4" /> Route
          </Button>
        }
      >
        {view.otherRoutes.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-subtle">None yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {view.otherRoutes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                <span className={r.status !== 'active' ? 'text-text-subtle' : 'font-medium'}>
                  {routeLabel(r)}
                  {r.status !== 'active' ? (
                    <>
                      {' '}
                      <Badge tone="neutral">Inactive</Badge>
                    </>
                  ) : null}
                </span>
                <span className="inline-flex flex-wrap items-center gap-3">
                  <span className="tabular-nums text-text-muted">
                    {kmText(r)} · {taText(r)}
                  </span>
                  <ActionLinks
                    label={routeLabel(r)}
                    disabled={readOnly}
                    actions={[
                      { label: 'View', alwaysOn: true, onClick: () => setOpened({ routeId: r.id, mode: 'view' }) },
                      { label: 'Edit', onClick: () => setOpened({ routeId: r.id, mode: 'edit' }) },
                      r.status === 'active' ? { label: 'Deactivate', tone: 'danger', onClick: () => setTogglingRoute(r) } : { label: 'Reactivate', onClick: () => setTogglingRoute(r) },
                      { label: 'Delete…', tone: 'danger', onClick: () => setDeletingRoute(r) },
                    ]}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {adding ? <AddPlaceDialog hq={hq} townName={townName} onClose={() => setAdding(false)} /> : null}
      {addingRoute ? (
        <AddRouteDialog
          hqPlaces={places.data?.items ?? []}
          defaultFromId={addingRoute.from}
          defaultToId={addingRoute.to}
          {...(addingRoute.title ? { title: addingRoute.title } : {})}
          onClose={() => setAddingRoute(null)}
        />
      ) : null}
      {opened ? <PlaceRouteDialog key={`${opened.routeId}:${opened.mode}`} routeId={opened.routeId} mode={opened.mode} onClose={() => setOpened(null)} /> : null}
      {townDay ? (
        <Dialog open onOpenChange={(open) => !open && setTownDay(false)} title={`A day in ${townName}`} description="No route and no TA, only the HQ DA.">
          <RoutePayPreview title={`What a day in ${townName} pays`} distanceKm="0" type="HQ" rate="" />
        </Dialog>
      ) : null}
      <DeleteTerritoryDialog segment="routes" item={deletingRoute ? { id: deletingRoute.id, name: routeLabel(deletingRoute) } : null} onClose={() => setDeletingRoute(null)} />
      <RouteStatusDialog route={togglingRoute} label={togglingRoute ? routeLabel(togglingRoute) : ''} onClose={() => setTogglingRoute(null)} />
      <StatusToggleDialog
        item={toggling}
        noun="place"
        pending={updatePlace.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) => toggling && updatePlace.mutate({ id: toggling.id, body: { status } })}
      />
    </div>
  );
}
