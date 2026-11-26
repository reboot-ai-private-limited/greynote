'use client';

import type { CreatePlaceDto, PlaceDto, UpdatePlaceDto } from '@greynote/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { SelectOption } from '@/components/ui/Select';
import { fetchAllPages, MAX_PAGE_SIZE } from '@/lib/api/allPages';
import { placesApi, routesImportApi, type ListPlacesQuery, type RoutesImportResultDto } from '@/lib/api/endpoints/territory';
import { useApiMutation } from '@/lib/query/mutation';
import { authedQueryOptions } from '@/lib/query/factory';
import { keys, staleTime } from '@/lib/query/keys';
import { useAllHqs } from './useHqs';

export function usePlaces(query?: ListPlacesQuery) {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.stations.list(query),
      fetch: (token, signal) => placesApi.list(token, query, signal),
      staleTime: staleTime.configuration,
    }),
  );
}

/** Every place of the company (tens to a few hundred), for the route form's pickers and names in tables. */
export function useAllPlaces() {
  return useQuery(
    authedQueryOptions({
      queryKey: keys.stations.directory(),
      fetch: (token, signal) => fetchAllPages((page) => placesApi.list(token, { page, pageSize: MAX_PAGE_SIZE }, signal)).then((r) => r.items),
      staleTime: staleTime.configuration,
    }),
  );
}

/** "Naxalbari (SILIGURI)", or just "SILIGURI" for an HQ town, whose name is the HQ's. */
export function placeLabel(place: Pick<PlaceDto, 'name' | 'hqId' | 'isHqTown'>, hqName: string | undefined): string {
  return place.isHqTown || !hqName ? place.name : `${place.name} (${hqName})`;
}

/** Active places as picker options labelled with their HQ, and id → place for table cells. */
export function usePlaceDirectory() {
  const places = useAllPlaces();
  const hqs = useAllHqs();
  return useMemo(() => {
    const hqName = new Map((hqs.data ?? []).map((h) => [h.id, h.name]));
    const items = places.data ?? [];
    const options: SelectOption[] = items
      .filter((p) => p.status === 'active')
      .map((p) => ({ value: p.id, label: placeLabel(p, hqName.get(p.hqId)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return {
      options,
      byId: new Map(items.map((p) => [p.id, p])),
      labelOf: (id: string | null | undefined) => {
        const p = id ? items.find((x) => x.id === id) : undefined;
        return p ? placeLabel(p, hqName.get(p.hqId)) : '—';
      },
      isLoading: places.isLoading || hqs.isLoading,
    };
  }, [places.data, places.isLoading, hqs.data, hqs.isLoading]);
}

/** A place's name or type re-makes its routes, so place writes refresh the routes too. */
const invalidates = () => [keys.stations.all(), keys.routes.all()];

export function useCreatePlace(onDone: () => void) {
  return useApiMutation<CreatePlaceDto, PlaceDto>({
    call: (token, body) => placesApi.create(token, body),
    invalidates: invalidates(),
    successMessage: 'Place created.',
    onSuccess: onDone,
  });
}

export function useUpdatePlace(onDone?: () => void) {
  return useApiMutation<{ id: string; body: UpdatePlaceDto }, PlaceDto>({
    call: (token, { id, body }) => placesApi.update(token, id, body),
    invalidates: invalidates(),
    successMessage: 'Place updated.',
    ...(onDone && { onSuccess: onDone }),
  });
}

export function useImportRoutes(onImported: (result: RoutesImportResultDto) => void) {
  return useApiMutation<{ file: File; dryRun: boolean }, RoutesImportResultDto>({
    call: (token, { file, dryRun }) => routesImportApi.upload(token, file, dryRun),
    invalidates: invalidates(),
    onSuccess: (result) => {
      if (!result.dryRun) onImported(result);
    },
  });
}
