'use client';

import { ROUTE_TYPES, type PlaceDto, type RouteDto, type RouteType } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { paiseToRupees } from '@/lib/money';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { usePlaceDirectory, useUpdatePlace } from '../hooks/usePlaces';
import { useUpdateRoute } from '../hooks/useRouteMutations';
import { useRoute } from '../hooks/useRoutes';
import { ROUTE_TYPE_LABEL } from '../lib/draft';
import { kmLabel, placeRouteChanges, taModeOf, type TaMode } from '../lib/routeDraft';
import { RoutePayPreview } from './RoutePayPreview';
import { TaChoiceFields } from './TaChoiceFields';

export type DialogMode = 'view' | 'edit';

export const taText = (r: Pick<RouteDto, 'taFixedPaise' | 'taPerKmRateOverridePaise'>) =>
  r.taFixedPaise != null ? `₹${paiseToRupees(r.taFixedPaise)} fixed` : r.taPerKmRateOverridePaise != null ? `₹${paiseToRupees(r.taPerKmRateOverridePaise)} / km` : 'Grade rate';

/**
 * One place's route, or any route, in one compact dialog (2026-11-27): it opens read-only (View) with an Edit button, or straight in edit
 * mode (Edit). For a place's own route from its HQ town, the place's name and type are edited here too, with the km and TA.
 */
export function PlaceRouteDialog({ routeId, mode, onClose }: { routeId: string; mode: DialogMode; onClose: () => void }) {
  const route = useRoute(routeId);
  if (!route.data) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()} title={route.isLoading ? 'Route' : 'Route not found'}>
        {route.isLoading ? <Skeleton className="h-40 w-full" /> : <p className="text-sm text-text-muted">It may have been deleted.</p>}
      </Dialog>
    );
  }
  return <Body key={route.data.id} route={route.data} startMode={mode} onClose={onClose} />;
}

function Body({ route, startMode, onClose }: { route: RouteDto; startMode: DialogMode; onClose: () => void }) {
  const readOnly = useIsReadOnly();
  const places = usePlaceDirectory();
  const [mode, setMode] = useState<DialogMode>(readOnly ? 'view' : startMode);

  const from = route.fromPlaceId ? places.byId.get(route.fromPlaceId) : undefined;
  const to = route.toPlaceId ? places.byId.get(route.toPlaceId) : undefined;
  // A place's own route: one end is its HQ town, the other a place of the same HQ — that place's name and type are edited here.
  const own: PlaceDto | null = from && to && from.hqId === to.hqId ? (from.isHqTown ? to : to.isHqTown ? from : null) : null;
  const typeNote = own ? null : from && to && from.hqId !== to.hqId ? 'Always out-station: the places are in two HQs.' : 'From its two places.';
  const title = from && to ? `${places.labelOf(from.id)} ↔ ${places.labelOf(to.id)}` : route.name;

  return (
    <>
      {mode === 'view' ? (
        <Dialog
          open
          onOpenChange={(open) => !open && onClose()}
          title={title}
          footer={
            <>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              {!readOnly ? <Button onClick={() => setMode('edit')}>Edit</Button> : null}
            </>
          }
        >
          <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
            {own ? <Line label="Place" value={own.name} /> : null}
            <Line label="Type" value={ROUTE_TYPE_LABEL[route.type]} />
            <Line label="Distance" value={route.distanceKm === null ? 'Not set' : kmLabel(route)} />
            <Line label="TA" value={taText(route)} />
            <Line label="Status" value={route.status === 'active' ? 'Active' : 'Inactive'} />
          </dl>
          <div className="mt-4">
            <RoutePayPreview
              distanceKm={route.distanceKm ?? ''}
              type={route.type}
              rate={route.taPerKmRateOverridePaise == null ? '' : paiseToRupees(route.taPerKmRateOverridePaise)}
              fixed={route.taFixedPaise == null ? '' : paiseToRupees(route.taFixedPaise)}
            />
          </div>
        </Dialog>
      ) : (
        <EditForm route={route} own={own} typeNote={typeNote} title={title} onCancel={() => (startMode === 'view' ? setMode('view') : onClose())} onSaved={() => setMode('view')} />
      )}
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-medium text-text">{value}</dd>
    </>
  );
}

function EditForm({
  route,
  own,
  typeNote,
  title,
  onCancel,
  onSaved,
}: {
  route: RouteDto;
  own: PlaceDto | null;
  typeNote: string | null;
  title: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(own?.name ?? '');
  const [type, setType] = useState<RouteType>(own?.type ?? route.type);
  const [distanceKm, setDistanceKm] = useState(route.distanceKm ?? '');
  const [taMode, setTaMode] = useState<TaMode>(taModeOf(route));
  const [rate, setRate] = useState(route.taPerKmRateOverridePaise == null ? '' : paiseToRupees(route.taPerKmRateOverridePaise));
  const [fixed, setFixed] = useState(route.taFixedPaise == null ? '' : paiseToRupees(route.taFixedPaise));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const updatePlace = useUpdatePlace();
  const updateRoute = useUpdateRoute(route.id);
  const pending = updatePlace.isPending || updateRoute.isPending;

  async function submit() {
    const built = placeRouteChanges(own, route, { name, type, distanceKm, taMode, rate, fixed });
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    try {
      if (own && built.body.place) await updatePlace.mutateAsync({ id: own.id, body: built.body.place });
      if (built.body.route) await updateRoute.mutateAsync(built.body.route);
      onSaved();
    } catch {
      // The hooks already show what went wrong; the form stays open with what was typed.
    }
  }

  return (
    <FormDialog title={title} formId="place-route-form" pending={pending} onClose={onCancel} onSubmit={() => void submit()}>
      {own ? (
        <FormField label="Place name" htmlFor="prd-name" error={errors['name']}>
          <Input id="prd-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={errors['name'] ? true : undefined} />
        </FormField>
      ) : null}
      <FormField label="Type" htmlFor="prd-type" hint={own ? 'A change applies to DA from now on.' : (typeNote ?? '')}>
        {own ? (
          <Select id="prd-type" value={type} onValueChange={(v) => setType(v as RouteType)} options={ROUTE_TYPES.map((t) => ({ value: t, label: ROUTE_TYPE_LABEL[t] }))} />
        ) : (
          <Input id="prd-type" value={ROUTE_TYPE_LABEL[route.type]} disabled readOnly />
        )}
      </FormField>
      <FormField label="Distance (km)" htmlFor="prd-km" error={errors['distanceKm']} hint="One way, by road.">
        <Input id="prd-km" inputMode="decimal" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} aria-invalid={errors['distanceKm'] ? true : undefined} />
      </FormField>
      <TaChoiceFields idPrefix="prd" taMode={taMode} onTaModeChange={setTaMode} rate={rate} onRateChange={setRate} fixed={fixed} onFixedChange={setFixed} errors={errors} />
      <RoutePayPreview distanceKm={distanceKm} type={own ? type : route.type} rate={taMode === 'RATE' ? rate : ''} fixed={taMode === 'FIXED' ? fixed : ''} />
    </FormDialog>
  );
}

/** Deactivate / Reactivate a route straight from a list row (asks first, like everywhere). */
export function RouteStatusDialog({ route, label, onClose }: { route: RouteDto | null; label: string; onClose: () => void }) {
  return route ? <RouteStatusDialogFor route={route} label={label} onClose={onClose} /> : null;
}

function RouteStatusDialogFor({ route, label, onClose }: { route: RouteDto; label: string; onClose: () => void }) {
  const update = useUpdateRoute(route.id, onClose);
  return (
    <StatusToggleDialog
      item={{ id: route.id, name: label, status: route.status }}
      noun="route"
      pending={update.isPending}
      onClose={onClose}
      onConfirm={(status) => update.mutate({ status })}
    />
  );
}
