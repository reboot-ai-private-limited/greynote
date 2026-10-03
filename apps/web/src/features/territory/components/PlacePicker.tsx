'use client';

import type { PlaceDto } from '@greynote/contracts';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toErrorState } from '@/lib/api/toErrorState';
import { PLACE_SEARCH_MIN_CHARS, useRealPlaceSearch, type PlaceSearchState } from '../hooks/usePlaceSearch';
import { samePlace, toPlace } from '../lib/place';
import { RouteMap } from './RouteMap';

/**
 * Pick ONE place by searching and confirming the pin on a map — an HQ's base place or a route's
 * destination. Only a place found by search can be chosen (never free text), so every coordinate that
 * feeds a distance was seen on the map first (HLD 02 §1).
 *
 * `from` is shown on the map as the start (pin A) when picking a destination, so the leg being measured is
 * visible; the chosen place is the end (pin B), or the only pin when there is no `from`.
 */
export function PlacePicker({
  id,
  label,
  hint,
  value,
  onChange,
  from = null,
  disabled = false,
  error,
  stacked = false,
  useSearch = useRealPlaceSearch,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  value: PlaceDto | null;
  onChange: (place: PlaceDto) => void;
  from?: PlaceDto | null;
  disabled?: boolean;
  error?: string | undefined;
  /** One column, for a narrow container such as a dialog. Otherwise the search sits beside the map on wide screens. */
  stacked?: boolean;
  /** Injectable so the /design preview can use a stub instead of the billed API call. */
  useSearch?: (term: string) => PlaceSearchState;
}) {
  const [term, setTerm] = useState('');
  const search = useSearch(term);
  const stops = [...(from ? [from] : []), ...(value ? [value] : [])];

  // Choosing closes the results: the chosen card and the map pin show it, and typing starts a new search.
  function choose(candidate: PlaceSearchState['candidates'][number]) {
    onChange(toPlace(candidate));
    setTerm('');
  }

  return (
    <div className={stacked ? 'space-y-6' : 'grid gap-6 lg:grid-cols-[1fr_1fr]'}>
      <div className="space-y-4">
        <div>
          <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text">
            {label}
          </label>
          <Input
            id={id}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search for a place, e.g. Naxalbari"
            disabled={disabled}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
          />
          {hint ? <p className="mt-1.5 text-[13px] text-text-subtle">{hint}</p> : null}
          <div aria-live="polite" className="mt-2">
            {!search.ready ? (
              <p className="text-[13px] text-text-subtle">Type at least {PLACE_SEARCH_MIN_CHARS} characters to search.</p>
            ) : search.isLoading ? (
              <p className="text-[13px] text-text-subtle">Searching…</p>
            ) : search.error ? (
              <p role="alert" className="text-[13px] text-danger-fg">
                {toErrorState(search.error).message}
              </p>
            ) : search.candidates.length === 0 ? (
              <p className="text-[13px] text-text-subtle">No places found.</p>
            ) : (
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {search.candidates.map((c) => {
                  const chosen = samePlace(value, toPlace(c));
                  return (
                    <li key={c.placeId} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text">{c.label}</p>
                        <p className="truncate text-xs text-text-subtle">{c.address}</p>
                      </div>
                      <Button size="sm" variant="secondary" disabled={disabled || chosen} onClick={() => choose(c)}>
                        {chosen ? 'Chosen' : (<><Plus aria-hidden className="size-3.5" /> Choose</>)}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-text">Chosen place</h3>
          {value ? (
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-sm font-medium text-text">{value.label}</p>
              <p className="text-xs text-text-subtle tabular-nums">
                {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
              </p>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border-strong p-4 text-center text-sm text-text-subtle">
              Nothing chosen yet. Search above and pick the place on the map.
            </p>
          )}
          {error ? (
            <p role="alert" className="mt-2 text-[13px] text-danger-fg">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <RouteMap stops={stops} candidates={search.ready ? search.candidates : []} heightClass={stacked ? 'h-48' : 'h-72'} />
    </div>
  );
}
