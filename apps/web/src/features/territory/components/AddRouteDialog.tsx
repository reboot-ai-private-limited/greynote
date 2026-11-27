'use client';

import type { PlaceDto } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { usePlaceDirectory } from '../hooks/usePlaces';
import { useCreateRoute } from '../hooks/useRouteMutations';
import { buildPlaceRoute, routeTypeBetween, type TaMode } from '../lib/routeDraft';
import { RoutePayPreview } from './RoutePayPreview';
import { TaChoiceFields } from './TaChoiceFields';

/**
 * "+ Route" — the one way to make a route other than a place's own route from its HQ town (2026-11-27). Inside an HQ, From is one of its
 * places; from the All routes tab, any place. To is any place in the company (another HQ's: a manager plans those). One route serves
 * both ways. A place left without its HQ-town route (older data) opens this with both ends chosen.
 */
export function AddRouteDialog({
  hqPlaces,
  defaultFromId,
  defaultToId,
  title = 'New route',
  onClose,
}: {
  /** The HQ's places to start from; leave out to start from any place. */
  hqPlaces?: readonly PlaceDto[] | undefined;
  defaultFromId?: string | undefined;
  defaultToId?: string | undefined;
  title?: string;
  onClose: () => void;
}) {
  const directory = usePlaceDirectory();
  const [fromPlaceId, setFrom] = useState(defaultFromId ?? '');
  const [toPlaceId, setTo] = useState(defaultToId ?? '');
  const [distanceKm, setDistanceKm] = useState('');
  const [taMode, setTaMode] = useState<TaMode>('GRADE');
  const [rate, setRate] = useState('');
  const [fixed, setFixed] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateRoute(() => onClose());

  const from = directory.byId.get(fromPlaceId);
  const to = directory.byId.get(toPlaceId);
  const fromOptions = hqPlaces
    ? hqPlaces.filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.isHqTown ? `${p.name} (HQ town)` : p.name }))
    : directory.options;

  function submit() {
    const built = buildPlaceRoute({ fromPlaceId, toPlaceId, distanceKm, taMode, rate, fixed });
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title={title}
      description="Two places and the km between them, one way. A route works both ways."
      formId="add-route-form"
      pending={create.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="From" htmlFor="ar-from" error={errors['fromPlaceId']}>
        <SearchableSelect
          id="ar-from"
          value={fromPlaceId}
          onValueChange={setFrom}
          options={fromOptions.filter((o) => o.value !== toPlaceId)}
          placeholder={directory.isLoading && !hqPlaces ? 'Loading places…' : 'Choose a place'}
          searchPlaceholder="Search places"
        />
      </FormField>
      <FormField label="To" htmlFor="ar-to" error={errors['toPlaceId']} hint="Any place, in this HQ or another.">
        <SearchableSelect
          id="ar-to"
          value={toPlaceId}
          onValueChange={setTo}
          options={directory.options.filter((o) => o.value !== fromPlaceId)}
          placeholder={directory.isLoading ? 'Loading places…' : 'Choose a place'}
          searchPlaceholder="Search places"
        />
      </FormField>
      <FormField label="Distance (km)" htmlFor="ar-km" error={errors['distanceKm']} hint="One way, by road.">
        <Input id="ar-km" inputMode="decimal" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} aria-invalid={errors['distanceKm'] ? true : undefined} />
      </FormField>
      <TaChoiceFields idPrefix="ar" taMode={taMode} onTaModeChange={setTaMode} rate={rate} onRateChange={setRate} fixed={fixed} onFixedChange={setFixed} errors={errors} />
      <RoutePayPreview
        distanceKm={distanceKm}
        type={from && to ? routeTypeBetween(from, to) : 'HQ'}
        rate={taMode === 'RATE' ? rate : ''}
        fixed={taMode === 'FIXED' ? fixed : ''}
      />
    </FormDialog>
  );
}
