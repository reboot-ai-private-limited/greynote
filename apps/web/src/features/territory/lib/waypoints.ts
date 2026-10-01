import { MAX_WAYPOINTS, MIN_WAYPOINTS, type WaypointDto } from '@greynote/contracts';

/**
 * Rules for a route's ordered stop list. Order is meaningful and the server never re-optimises it,
 * so every operation here preserves exactly the order the Admin set. Pure and tested.
 */

export type AddResult = { ok: true; waypoints: WaypointDto[] } | { ok: false; reason: 'DUPLICATE' | 'FULL' };

export function hasPlace(list: readonly WaypointDto[], placeId: string): boolean {
  return list.some((w) => w.placeId === placeId);
}

/** Appends a stop. The same place twice is refused (it would be a zero-length leg), and so is a 26th stop. */
export function addWaypoint(list: readonly WaypointDto[], waypoint: WaypointDto): AddResult {
  if (hasPlace(list, waypoint.placeId)) return { ok: false, reason: 'DUPLICATE' };
  if (list.length >= MAX_WAYPOINTS) return { ok: false, reason: 'FULL' };
  return { ok: true, waypoints: [...list, waypoint] };
}

/** Moves a stop one place up (`-1`) or down (`1`); a move off either end does nothing. */
export function moveWaypoint(list: readonly WaypointDto[], index: number, direction: -1 | 1): WaypointDto[] {
  const target = index + direction;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

export function removeWaypoint(list: readonly WaypointDto[], index: number): WaypointDto[] {
  return list.filter((_, i) => i !== index);
}

/** What is wrong with the list as it stands, or undefined when it can be saved. */
export function validateWaypoints(list: readonly WaypointDto[]): string | undefined {
  if (list.length < MIN_WAYPOINTS) return `Add at least ${MIN_WAYPOINTS} stops — a start and an end.`;
  if (list.length > MAX_WAYPOINTS) return `A route can have at most ${MAX_WAYPOINTS} stops.`;
  return undefined;
}

/** Start, Via 1…, End — the role of the stop at `index` of `total`. */
export function stopRole(index: number, total: number): string {
  if (index === 0) return 'Start';
  if (index === total - 1) return 'End';
  return `Via ${index}`;
}

/** Whether two lists are the same stops in the same order — the editor's "unsaved changes" test. */
export function sameWaypoints(a: readonly WaypointDto[], b: readonly WaypointDto[]): boolean {
  return (
    a.length === b.length &&
    a.every((w, i) => w.placeId === b[i]?.placeId && w.latitude === b[i]?.latitude && w.longitude === b[i]?.longitude)
  );
}
