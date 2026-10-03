import type { PlaceDto } from '@greynote/contracts';

/** Whether two places are the same pin — the pickers' "unsaved change" test. */
export function samePlace(a: PlaceDto | null | undefined, b: PlaceDto | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.placeId === b.placeId && a.latitude === b.latitude && a.longitude === b.longitude;
}

/** A search hit, kept as the place the API stores. */
export function toPlace(candidate: { label: string; latitude: number; longitude: number; placeId: string }): PlaceDto {
  return { label: candidate.label, latitude: candidate.latitude, longitude: candidate.longitude, placeId: candidate.placeId };
}
