import type { CreateRouteDto, RouteDto, UpdateRouteDto, WaypointDto } from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { ApiError } from '@/lib/api/ApiError';
import { rupeesToPaise } from '@/lib/money';
import { fail, nameError, normalizeName, type BuildResult } from './draft';
import { validateWaypoints } from './waypoints';

/** Form drafts → request bodies for routes, and how a route's distance should be presented. */

const RATE_HINT = 'Enter a rate in rupees per km, like 7.50.';

/** The optional per-km rate: '' means none; otherwise rupees → integer paise, or an error. */
function parseRate(raw: string): { ok: true; paise: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, paise: null };
  const paise = rupeesToPaise(trimmed);
  return paise === null ? { ok: false, error: RATE_HINT } : { ok: true, paise };
}

export function buildRoute(draft: {
  areaId: string;
  name: string;
  rate: string;
  waypoints: readonly WaypointDto[];
}): BuildResult<CreateRouteDto> {
  const name = normalizeName(draft.name);
  const rate = parseRate(draft.rate);
  const errors = {
    areaId: draft.areaId ? undefined : 'Choose an area.',
    name: nameError(name),
    rate: rate.ok ? undefined : rate.error,
    waypoints: validateWaypoints(draft.waypoints),
  };
  if (errors.areaId || errors.name || errors.rate || errors.waypoints || !rate.ok) return fail(errors);
  return {
    ok: true,
    body: {
      areaId: draft.areaId,
      name,
      waypoints: [...draft.waypoints],
      ...(rate.paise !== null && { taPerKmRateOverridePaise: rate.paise }),
    },
  };
}

/**
 * The details that changed. The API rejects an empty update, so an unchanged form is `{ ok: true, body: {} }`
 * and the caller just closes. Clearing a rate sends `null` — an absent field would leave it as it was.
 */
export function changedRouteFields(original: RouteDto, draft: { name: string; rate: string }): BuildResult<UpdateRouteDto> {
  const name = normalizeName(draft.name);
  const rate = parseRate(draft.rate);
  const errors = { name: nameError(name), rate: rate.ok ? undefined : rate.error };
  if (errors.name || errors.rate || !rate.ok) return fail(errors);
  return {
    ok: true,
    body: {
      ...(name !== original.name && { name }),
      ...(rate.paise !== original.taPerKmRateOverridePaise && { taPerKmRateOverridePaise: rate.paise }),
    },
  };
}

/** A manual distance: a positive number with at most 2 decimals, sent as the string the API expects. */
export function buildDistanceOverride(raw: string): { ok: true; distanceKm: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { ok: false, error: 'Enter the distance in km, up to 2 decimals.' };
  if (Number(trimmed) <= 0) return { ok: false, error: 'The distance must be more than 0 km.' };
  return { ok: true, distanceKm: trimmed };
}

export interface DistanceSummary {
  /** `12.50 km`, or `—` when unknown. A failed route is never shown as 0 km. */
  km: string;
  label: 'Calculated' | 'Manual' | 'Failed';
  tone: BadgeTone;
}

export function distanceSummary(route: Pick<RouteDto, 'distanceKm' | 'distanceStatus' | 'distanceSource'>): DistanceSummary {
  if (route.distanceStatus === 'FAILED' || route.distanceKm === null) return { km: '—', label: 'Failed', tone: 'danger' };
  const km = `${route.distanceKm} km`;
  return route.distanceSource === 'MANUAL_OVERRIDE'
    ? { km, label: 'Manual', tone: 'accent' }
    : { km, label: 'Calculated', tone: 'success' };
}

/** `currentRevision` when this is the "route changed elsewhere" conflict, else null. */
export function staleRevisionOf(error: unknown): { currentRevision: number | undefined } | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const data = error.data;
  if (typeof data !== 'object' || data === null || (data as Record<string, unknown>)['field'] !== 'revision') return null;
  const current = (data as Record<string, unknown>)['currentRevision'];
  return { currentRevision: typeof current === 'number' ? current : undefined };
}
