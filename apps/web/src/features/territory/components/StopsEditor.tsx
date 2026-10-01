'use client';

import { MAX_WAYPOINTS, type WaypointDto } from '@greynote/contracts';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { toErrorState } from '@/lib/api/toErrorState';
import { PLACE_SEARCH_MIN_CHARS, useRealPlaceSearch, type PlaceSearchState } from '../hooks/usePlaceSearch';
import { addWaypoint, hasPlace, moveWaypoint, removeWaypoint, stopRole, validateWaypoints } from '../lib/waypoints';
import { RouteMap } from './RouteMap';

/**
 * The ordered stop list with place search and a map preview — shared by create and detail.
 * Only a place found by search can become a stop (never free text), the same place cannot be added
 * twice, and the list is held to 2–25 stops. Order is the Admin's and is never re-optimised.
 */
export function StopsEditor({
  stops,
  onChange,
  disabled = false,
  error,
  useSearch = useRealPlaceSearch,
}: {
  stops: readonly WaypointDto[];
  onChange: (stops: WaypointDto[]) => void;
  disabled?: boolean;
  /** A server/form error to show under the list (e.g. "Add at least 2 stops"). */
  error?: string | undefined;
  /** Injectable so the /design preview can use a stub instead of the billed API call. */
  useSearch?: (term: string) => PlaceSearchState;
}) {
  const [term, setTerm] = useState('');
  const search = useSearch(term);
  const full = stops.length >= MAX_WAYPOINTS;
  const problem = error ?? validateWaypoints(stops);

  function add(c: PlaceSearchState['candidates'][number]) {
    const result = addWaypoint(stops, { label: c.label, latitude: c.latitude, longitude: c.longitude, placeId: c.placeId });
    if (result.ok) onChange(result.waypoints);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-5">
        <div>
          <label htmlFor="stop-search" className="mb-1.5 block text-sm font-medium text-text">
            Add a stop
          </label>
          <Input
            id="stop-search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search for a place, e.g. Matigara bus stand"
            disabled={disabled || full}
            autoComplete="off"
          />
          <div aria-live="polite" className="mt-2">
            {full ? (
              <p className="text-[13px] text-text-subtle">A route can have at most {MAX_WAYPOINTS} stops.</p>
            ) : !search.ready ? (
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
              <ul className="divide-y divide-border rounded-md border border-border">
                {search.candidates.map((c) => {
                  const added = hasPlace(stops, c.placeId);
                  return (
                    <li key={c.placeId} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text">{c.label}</p>
                        <p className="truncate text-xs text-text-subtle">{c.address}</p>
                      </div>
                      <Button size="sm" variant="secondary" disabled={disabled || added} onClick={() => add(c)}>
                        {added ? 'Added' : (<><Plus aria-hidden className="size-3.5" /> Add</>)}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-text">Stops in order</h3>
            <span className="text-xs text-text-subtle tabular-nums">
              {stops.length} / {MAX_WAYPOINTS}
            </span>
          </div>
          {stops.length === 0 ? (
            <p className="rounded-md border border-dashed border-border-strong p-4 text-center text-sm text-text-subtle">
              No stops yet. Search above and add a start and an end.
            </p>
          ) : (
            <ol className="divide-y divide-border rounded-md border border-border">
              {stops.map((s, i) => (
                <li key={s.placeId} className="flex items-center gap-3 px-3 py-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-text tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{s.label}</p>
                    <p className="text-xs text-text-subtle tabular-nums">
                      {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                    </p>
                  </div>
                  <Badge tone={i === 0 || i === stops.length - 1 ? 'accent' : 'neutral'}>{stopRole(i, stops.length)}</Badge>
                  <div className="flex shrink-0 gap-0.5">
                    <Button size="sm" variant="ghost" aria-label={`Move ${s.label} up`} disabled={disabled || i === 0} onClick={() => onChange(moveWaypoint(stops, i, -1))}>
                      <ArrowUp aria-hidden className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Move ${s.label} down`} disabled={disabled || i === stops.length - 1} onClick={() => onChange(moveWaypoint(stops, i, 1))}>
                      <ArrowDown aria-hidden className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Remove ${s.label}`} disabled={disabled} onClick={() => onChange(removeWaypoint(stops, i))}>
                      <X aria-hidden className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {problem && stops.length > 0 ? <p role="alert" className="mt-2 text-[13px] text-danger-fg">{problem}</p> : null}
          {error && stops.length === 0 ? <p role="alert" className="mt-2 text-[13px] text-danger-fg">{error}</p> : null}
        </div>
      </div>

      <RouteMap stops={stops} candidates={search.ready ? search.candidates : []} />
    </div>
  );
}
