'use client';

import type { GeoPoint } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { toErrorState } from '@/lib/api/toErrorState';
import { PLACE_SEARCH_MIN_CHARS, useRealPlaceSearch } from '@/features/territory/hooks/usePlaceSearch';
import { EMPTY_COORDINATES, formatPoint, pointFromInputs, pointToInputs, type CoordinateInputs } from '../lib/location';
import { LocationMap } from './LocationMap';

/**
 * Sets a registered location three ways: search a place, click or drag the pin, or type the
 * coordinates. The form keeps the two numbers as strings (`inputs`); the builder turns them into a
 * point at submit and says what is wrong, so a half-typed value is never silently dropped.
 */
export function LocationPicker({
  inputs,
  onChange,
  errors,
  captured,
  disabled = false,
}: {
  inputs: CoordinateInputs;
  onChange: (inputs: CoordinateInputs) => void;
  errors?: { latitude?: string | undefined; longitude?: string | undefined } | undefined;
  /** The phone's own point, when there is one: shown as a grey pin to compare with. */
  captured?: GeoPoint | null | undefined;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState('');
  const search = useRealPlaceSearch(term);
  const parsed = pointFromInputs(inputs);
  const point = parsed.ok ? parsed.point : null;
  const setPoint = (p: GeoPoint) => onChange(pointToInputs(p));

  return (
    <div className="space-y-4">
      <FormField label="Find a place" htmlFor="location-search" hint={`Type at least ${PLACE_SEARCH_MIN_CHARS} characters, then choose a result.`}>
        <Input
          id="location-search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="e.g. Medical More, Siliguri"
          autoComplete="off"
          disabled={disabled}
        />
      </FormField>
      {search.ready ? (
        <div aria-live="polite" className="max-h-48 overflow-y-auto">
          {search.isLoading ? (
            <p className="text-[13px] text-text-subtle">Searching…</p>
          ) : search.error ? (
            <p role="alert" className="text-[13px] text-danger-fg">{toErrorState(search.error).message}</p>
          ) : search.candidates.length === 0 ? (
            <p className="text-[13px] text-text-subtle">No place matches.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {search.candidates.map((c) => (
                <li key={c.placeId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{c.label}</p>
                    <p className="truncate text-xs text-text-subtle">{c.address}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => {
                      setPoint({ latitude: c.latitude, longitude: c.longitude });
                      setTerm('');
                    }}
                  >
                    Use
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <LocationMap point={point} captured={captured} disabled={disabled} onPick={setPoint} />
      <p className="text-xs text-text-subtle">
        Click the map or drag the pin to set the location.
        {captured ? ' The grey pin is where the phone was when the record was added.' : ''}
      </p>

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <FormField label="Latitude" htmlFor="location-lat" error={errors?.latitude}>
          <Input
            id="location-lat"
            inputMode="decimal"
            value={inputs.latitude}
            disabled={disabled}
            onChange={(e) => onChange({ ...inputs, latitude: e.target.value })}
            aria-invalid={errors?.latitude ? true : undefined}
          />
        </FormField>
        <FormField label="Longitude" htmlFor="location-lng" error={errors?.longitude}>
          <Input
            id="location-lng"
            inputMode="decimal"
            value={inputs.longitude}
            disabled={disabled}
            onChange={(e) => onChange({ ...inputs, longitude: e.target.value })}
            aria-invalid={errors?.longitude ? true : undefined}
          />
        </FormField>
        <div className="sm:pt-[1.625rem]">
          <Button variant="secondary" disabled={disabled || (inputs.latitude === '' && inputs.longitude === '')} onClick={() => onChange({ ...EMPTY_COORDINATES })}>
            Clear
          </Button>
        </div>
      </div>
      <p className="text-xs text-text-subtle">
        {point ? `Registered at ${formatPoint(point)}.` : 'No location set: the geofence cannot check visits to this place until one is.'}
      </p>
    </div>
  );
}
