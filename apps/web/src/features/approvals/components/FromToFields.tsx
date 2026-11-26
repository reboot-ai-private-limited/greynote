'use client';

import { FormField } from '@/components/ui/FormField';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { usePlanDestinations, usePlanPlaces } from '../hooks/usePreviews';

const TYPE = { HQ: 'HQ', EX_STATION: 'Ex', OUT_STATION: 'Out' } as const;

/**
 * A Tour Plan day's From → To (decision-log 2026-11-26). From is any place the owner's plan can go to (their HQ, a manager's also the
 * team's); To lists only the places a typed route reaches from there, with its km, and staying at From. No route means it isn't
 * offered: Admin adds the route under Territory → Routes.
 */
export function FromToFields({
  ownerId,
  fromPlaceId,
  toPlaceId,
  onChange,
}: {
  ownerId: string;
  fromPlaceId: string | null | undefined;
  toPlaceId: string | null | undefined;
  onChange: (next: { fromPlaceId: string | null; toPlaceId: string | null; routeIds: string[] }) => void;
}) {
  const places = usePlanPlaces(ownerId);
  const destinations = usePlanDestinations(ownerId, fromPlaceId);
  const placeOptions = (places.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.name}${p.isHqTown ? ' (HQ town)' : ''} — ${p.hqName ?? ''} · ${TYPE[p.type]}`,
  }));
  const toOptions = (destinations.data ?? []).map((d) => ({
    value: d.place.id,
    label: d.stay ? `Stay at ${d.place.name}` : `${d.place.name} — ${d.distanceKm ?? '?'} km · ${TYPE[d.place.type]}`,
  }));
  const noRoute = Boolean(fromPlaceId) && !destinations.isLoading && toOptions.length <= 1;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="From" htmlFor="plan-from">
        <SearchableSelect
          id="plan-from"
          value={fromPlaceId ?? ''}
          onValueChange={(id) => onChange({ fromPlaceId: id || null, toPlaceId: null, routeIds: [] })}
          options={placeOptions}
          placeholder={places.isLoading ? 'Loading places…' : 'Where the day starts'}
          searchPlaceholder="Search places"
        />
      </FormField>
      <FormField
        label="To"
        htmlFor="plan-to"
        {...(noRoute ? { hint: 'No route from here yet. Ask Admin to add one under Territory → Routes, or stay at this place.' } : {})}
      >
        <SearchableSelect
          id="plan-to"
          value={toPlaceId ?? ''}
          disabled={!fromPlaceId}
          onValueChange={(id) => {
            const d = destinations.data?.find((x) => x.place.id === id);
            onChange({ fromPlaceId: fromPlaceId ?? null, toPlaceId: id || null, routeIds: d?.routeId ? [d.routeId] : [] });
          }}
          options={toOptions}
          placeholder={!fromPlaceId ? 'Choose From first' : destinations.isLoading ? 'Loading…' : 'Where the day goes'}
          searchPlaceholder="Search places"
        />
      </FormField>
    </div>
  );
}
