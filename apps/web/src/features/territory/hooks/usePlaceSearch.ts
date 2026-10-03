'use client';

import type { PlaceCandidateDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { placesApi } from '@/lib/api/endpoints/territory';
import { timing } from '@/lib/hooks/timing';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys } from '@/lib/query/keys';

/** Every search is a billed Google call, so: wait for a pause, need 3+ characters, cache, never retry. */
export const PLACE_SEARCH_MIN_CHARS = 3;
const CACHE_MS = 5 * 60_000;

export function usePlaceSearch(term: string) {
  const debounced = useDebouncedValue(term.trim(), timing.placeSearchDebounceMs);
  const enabled = debounced.length >= PLACE_SEARCH_MIN_CHARS;
  const query = useQuery(
    authedQueryOptions({
      queryKey: keys.places.search(debounced.toLowerCase()),
      fetch: (token, signal) => placesApi.search(token, debounced, signal),
      staleTime: CACHE_MS,
      enabled,
      refetchOnWindowFocus: false,
      retry: false,
    }),
  );
  return { query, enabled, searchedTerm: debounced };
}

/** What the place picker needs from a search, so a stub can stand in for it (the /design preview). */
export interface PlaceSearchState {
  candidates: PlaceCandidateDto[];
  isLoading: boolean;
  error: unknown;
  /** Whether the term is long enough to search at all. */
  ready: boolean;
}

export function useRealPlaceSearch(term: string): PlaceSearchState {
  const { query, enabled } = usePlaceSearch(term);
  return { candidates: query.data ?? [], isLoading: enabled && query.isFetching, error: query.error, ready: enabled };
}
