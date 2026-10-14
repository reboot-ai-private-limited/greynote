import { ROUTE_TYPES, type CreateRouteDto, type RouteDto, type RouteType, type UpdateRouteDto } from '@greynote/contracts';
import { rupeesToPaise } from '@/lib/money';
import { AUTO_ROUTE_TYPE, fail, nameError, normalizeName, type BuildResult } from './draft';

/** Form drafts → request bodies for routes, and how a route's km and type are presented. */

const RATE_HINT = 'Enter a rate in rupees per km, like 7.50.';

/** The optional per-km rate: '' means none; otherwise rupees → integer paise, or an error. */
function parseRate(raw: string): { ok: true; paise: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, paise: null };
  const paise = rupeesToPaise(trimmed);
  return paise === null ? { ok: false, error: RATE_HINT } : { ok: true, paise };
}

/** The km Admin types: more than 0, up to 2 decimals, sent as the string the API expects. */
export function parseKm(raw: string): { ok: true; km: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: 'Enter the distance in km.' };
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { ok: false, error: 'Enter the distance in km, up to 2 decimals.' };
  if (Number(trimmed) <= 0) return { ok: false, error: 'The distance must be more than 0 km.' };
  return { ok: true, km: trimmed };
}

const isRouteType = (value: string): value is RouteType => (ROUTE_TYPES as readonly string[]).includes(value);

export interface StationThresholds {
  exStationKm: number;
  outStationKm: number;
}

/** What Automatic gives for a km — the same rule as the server (strictly "over" a threshold). Null while the km is not a number yet. */
export function suggestedType(rawKm: string, thresholds: StationThresholds | null): RouteType | null {
  const km = parseKm(rawKm);
  if (!thresholds || !km.ok) return null;
  const value = Number(km.km);
  if (value > thresholds.outStationKm) return 'OUT_STATION';
  if (value > thresholds.exStationKm) return 'EX_STATION';
  return 'HQ';
}

export function buildRoute(draft: {
  hqId: string;
  destinationName: string;
  distanceKm: string;
  type: string;
  rate: string;
}): BuildResult<CreateRouteDto> {
  const destinationName = normalizeName(draft.destinationName);
  const km = parseKm(draft.distanceKm);
  const rate = parseRate(draft.rate);
  const typeOk = draft.type === AUTO_ROUTE_TYPE || isRouteType(draft.type);
  const errors = {
    hqId: draft.hqId ? undefined : 'Choose an HQ.',
    destinationName: nameError(destinationName)?.replace('Enter a name.', 'Enter the destination.'),
    distanceKm: km.ok ? undefined : km.error,
    type: typeOk ? undefined : 'Choose a type.',
    rate: rate.ok ? undefined : rate.error,
  };
  if (errors.hqId || errors.destinationName || errors.distanceKm || errors.type || errors.rate || !km.ok || !rate.ok) {
    return fail(errors);
  }
  return {
    ok: true,
    body: {
      hqId: draft.hqId,
      destinationName,
      distanceKm: km.km,
      // Automatic: no type is sent, and the server takes it from the km.
      ...(isRouteType(draft.type) && { type: draft.type }),
      ...(rate.paise !== null && { taPerKmRateOverridePaise: rate.paise }),
    },
  };
}

/**
 * The details that changed. The API rejects an empty update, so an unchanged form is `{ ok: true, body: {} }`
 * and the caller just closes. Clearing a rate sends `null` — an absent field would leave it as it was.
 */
export function changedRouteFields(
  original: RouteDto,
  draft: { destinationName: string; distanceKm: string; type: RouteType | typeof AUTO_ROUTE_TYPE; rate: string },
): BuildResult<UpdateRouteDto> {
  const destinationName = normalizeName(draft.destinationName);
  const km = parseKm(draft.distanceKm);
  const rate = parseRate(draft.rate);
  const errors = {
    destinationName: nameError(destinationName)?.replace('Enter a name.', 'Enter the destination.'),
    distanceKm: km.ok ? undefined : km.error,
    rate: rate.ok ? undefined : rate.error,
  };
  if (errors.destinationName || errors.distanceKm || errors.rate || !km.ok || !rate.ok) return fail(errors);
  return {
    ok: true,
    body: {
      ...(destinationName !== original.destinationName && { destinationName }),
      ...(Number(km.km) !== Number(original.distanceKm) && { distanceKm: km.km }),
      // Automatic hands the type back to the km; a chosen type that is new, or replaces Automatic, is sent.
      ...(draft.type === AUTO_ROUTE_TYPE ? original.typeSource !== 'AUTO' && { typeSource: 'AUTO' as const } : (draft.type !== original.type || original.typeSource === 'AUTO') && { type: draft.type }),
      ...(rate.paise !== original.taPerKmRateOverridePaise && { taPerKmRateOverridePaise: rate.paise }),
    },
  };
}

/** `12.50 km`, or `Not set` for a route that has no km yet — never shown as 0 km. */
export function kmLabel(route: Pick<RouteDto, 'distanceKm'>): string {
  return route.distanceKm === null ? 'Not set' : `${route.distanceKm} km`;
}
