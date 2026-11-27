import type { PlaceRow, TerritorySnapshot } from '@/types/sync';

import { apiGet } from './api';

/** Where a day from a place can go: along a typed route (with its km), or staying there. */
export type Destination = { place: PlaceRow; routeId: string | null; distanceKm: string | null; stay: boolean };

/**
 * From → To for your own plan, offline (decision-log 2026-11-26): from the cached `territory` pull, staying at From plus every place of your HQ a
 * typed route reaches from it. No route, not offered.
 */
export function destinationsOffline(territory: TerritorySnapshot | null | undefined, fromPlaceId: string): Destination[] {
  const places = new Map((territory?.places ?? []).map((p) => [p.id, p]));
  const from = places.get(fromPlaceId);
  if (!from) return [];
  const out: Destination[] = [];
  for (const r of territory?.routes ?? []) {
    const other = r.fromPlaceId === fromPlaceId ? r.toPlaceId : r.toPlaceId === fromPlaceId ? r.fromPlaceId : null;
    const place = other && other !== fromPlaceId ? places.get(other) : undefined;
    if (place) out.push({ place, routeId: r.id, distanceKm: r.distanceKm, stay: false });
  }
  return [{ place: from, routeId: null, distanceKm: null, stay: true }, ...out.sort((a, b) => a.place.name.localeCompare(b.place.name))];
}

/** A manager's plan, or someone else's being edited: the places it can go to (their HQ, and their team's), from the server. */
export const listPlanPlaces = (userId?: string) => apiGet<PlaceRow[]>(`/planning/places${userId ? `?userId=${userId}` : ''}`, { auth: true });

export const listDestinations = (fromPlaceId: string, userId?: string) =>
  apiGet<Destination[]>(`/planning/destinations?fromPlaceId=${fromPlaceId}${userId ? `&userId=${userId}` : ''}`, { auth: true });

/** Names for places seen so far (the cached ones and every list fetched), so a day can show "Siliguri → Naxalbari" offline. */
const known = new Map<string, PlaceRow>();
export function rememberPlaces(places: readonly PlaceRow[]): void {
  for (const p of places) known.set(p.id, p);
}
export const placeName = (id: string | null | undefined, territory?: TerritorySnapshot | null): string | null => {
  if (!id) return null;
  return known.get(id)?.name ?? territory?.places?.find((p) => p.id === id)?.name ?? null;
};

/**
 * Where a day goes, in words: "Siliguri → Naxalbari", or "At Naxalbari" for a day spent there. `null` for a day with no places (older
 * days, meetings) or whose place names this phone hasn't seen yet.
 */
export function dayWhere(day: { fromPlaceId?: string | null; toPlaceId?: string | null }, territory?: TerritorySnapshot | null): string | null {
  if (!day.fromPlaceId || !day.toPlaceId) return null;
  // Remember the cached places, so a plain text summary elsewhere can name them too.
  if (territory?.places) rememberPlaces(territory.places);
  const from = placeName(day.fromPlaceId, territory);
  const to = placeName(day.toPlaceId, territory);
  if (!to) return null;
  return day.fromPlaceId === day.toPlaceId ? `At ${to}` : `${from ?? 'Start'} → ${to}`;
}

/**
 * The place a doctor or chemist sits on (2026-11-27: added by place). A draft saved by an older version, or an older server's record,
 * may carry only a route: its To place is used.
 */
export function outletPlaceId(record: { placeId?: string | null; routeId?: string | null }, territory?: TerritorySnapshot | null): string | null {
  if (record.placeId) return record.placeId;
  const route = record.routeId ? territory?.routes.find((r) => r.id === record.routeId) : undefined;
  return route?.toPlaceId ?? null;
}
