import { ROUTE_TYPES, type CreatePlaceDto, type CreateRouteDto, type PlaceDto, type RouteDto, type RouteType, type UpdatePlaceDto, type UpdateRouteDto } from '@greynote/contracts';
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

/** How a route pays TA (decision-log 2026-11-26): each grade's rate, the route's own rate per km, or a fixed amount. */
export type TaMode = 'GRADE' | 'RATE' | 'FIXED';
export const TA_MODE_LABEL: Record<TaMode, string> = { GRADE: "Each grade's rate per km", RATE: 'Own rate per km', FIXED: 'Fixed amount for the day' };

/** How a route's TA reads in a list: "No TA (fixed ₹0)", "₹350 fixed", "₹7.50 / km" or "Grade rate". */
export function fixedTaText(paise: number): string {
  return paise === 0 ? 'No TA (fixed ₹0)' : `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} fixed`;
}

export function taModeOf(route: Pick<RouteDto, 'taPerKmRateOverridePaise' | 'taFixedPaise'>): TaMode {
  if (route.taFixedPaise != null) return 'FIXED';
  return route.taPerKmRateOverridePaise != null ? 'RATE' : 'GRADE';
}

/** The TA fields to send for the chosen mode: the other one is always null, so a switch clears it. */
function parseTa(draft: { taMode: TaMode; rate: string; fixed: string }):
  | { ok: true; taPerKmRateOverridePaise: number | null; taFixedPaise: number | null }
  | { ok: false; errors: Record<string, string | undefined> } {
  if (draft.taMode === 'GRADE') return { ok: true, taPerKmRateOverridePaise: null, taFixedPaise: null };
  const raw = draft.taMode === 'RATE' ? draft.rate : draft.fixed;
  const paise = raw.trim() === '' ? null : rupeesToPaise(raw.trim());
  // A fixed amount may be 0 (2026-11-28): no TA for a day there (DA is still paid). A rate per km must be above 0.
  if (paise === null || paise < 0 || (draft.taMode === 'RATE' && paise === 0)) {
    return { ok: false, errors: draft.taMode === 'RATE' ? { rate: RATE_HINT } : { fixed: 'Enter the amount in rupees, like 350.' } };
  }
  return draft.taMode === 'RATE' ? { ok: true, taPerKmRateOverridePaise: paise, taFixedPaise: null } : { ok: true, taPerKmRateOverridePaise: null, taFixedPaise: paise };
}

const TYPE_RANK: Record<RouteType, number> = { HQ: 0, EX_STATION: 1, OUT_STATION: 2 };
/** The type the server gives a route between these places: out-station across HQs, else the farther end's (`routeTypeBetween`). */
export function routeTypeBetween(from: { hqId: string; type: RouteType }, to: { hqId: string; type: RouteType }): RouteType {
  if (from.hqId !== to.hqId) return 'OUT_STATION';
  return TYPE_RANK[from.type] >= TYPE_RANK[to.type] ? from.type : to.type;
}

export function buildPlaceRoute(draft: { fromPlaceId: string; toPlaceId: string; distanceKm: string; taMode: TaMode; rate: string; fixed: string }): BuildResult<CreateRouteDto> {
  const km = parseKm(draft.distanceKm);
  const ta = parseTa(draft);
  const errors = {
    fromPlaceId: draft.fromPlaceId ? undefined : 'Choose where the route starts.',
    toPlaceId: !draft.toPlaceId ? 'Choose where the route goes.' : draft.toPlaceId === draft.fromPlaceId ? 'Choose a different place: a day at one place needs no route.' : undefined,
    distanceKm: km.ok ? undefined : km.error,
    ...(ta.ok ? {} : ta.errors),
  };
  if (errors.fromPlaceId || errors.toPlaceId || !km.ok || !ta.ok) return fail(errors);
  return {
    ok: true,
    body: {
      fromPlaceId: draft.fromPlaceId,
      toPlaceId: draft.toPlaceId,
      distanceKm: km.km,
      ...(ta.taPerKmRateOverridePaise !== null && { taPerKmRateOverridePaise: ta.taPerKmRateOverridePaise }),
      ...(ta.taFixedPaise !== null && { taFixedPaise: ta.taFixedPaise }),
    },
  };
}

/** km and TA of a route between places (its name and type come from the places). Unchanged → `{ ok: true, body: {} }`. */
export function changedPlaceRouteFields(original: RouteDto, draft: { distanceKm: string; taMode: TaMode; rate: string; fixed: string }): BuildResult<UpdateRouteDto> {
  const km = parseKm(draft.distanceKm);
  const ta = parseTa(draft);
  if (!km.ok || !ta.ok) return fail({ distanceKm: km.ok ? undefined : km.error, ...(ta.ok ? {} : ta.errors) });
  return {
    ok: true,
    body: {
      ...(Number(km.km) !== Number(original.distanceKm) && { distanceKm: km.km }),
      ...(ta.taPerKmRateOverridePaise !== original.taPerKmRateOverridePaise && { taPerKmRateOverridePaise: ta.taPerKmRateOverridePaise }),
      ...(ta.taFixedPaise !== (original.taFixedPaise ?? null) && { taFixedPaise: ta.taFixedPaise }),
    },
  };
}

/**
 * The Territory page's "+ Place" (2026-11-27): name, type, and the km from the HQ town with its TA — the place and that route are made in
 * one save. The km is required: a place is planned by that route.
 */
export function buildNewPlace(draft: { hqId: string; name: string; type: RouteType | ''; distanceKm: string; taMode: TaMode; rate: string; fixed: string }): BuildResult<CreatePlaceDto> {
  const name = normalizeName(draft.name);
  const km = parseKm(draft.distanceKm);
  const ta = parseTa(draft);
  const errors = {
    name: nameError(name)?.replace('Enter a name.', 'Enter the place’s name.'),
    type: draft.type ? undefined : 'Choose a type.',
    distanceKm: km.ok ? undefined : km.error,
    ...(ta.ok ? {} : ta.errors),
  };
  if (errors.name || errors.type || !km.ok || !ta.ok || !draft.type) return fail(errors);
  return {
    ok: true,
    body: {
      hqId: draft.hqId,
      name,
      type: draft.type,
      distanceKm: km.km,
      ...(ta.taPerKmRateOverridePaise !== null && { taPerKmRateOverridePaise: ta.taPerKmRateOverridePaise }),
      ...(ta.taFixedPaise !== null && { taFixedPaise: ta.taFixedPaise }),
    },
  };
}

/**
 * The place/route dialog's Save (2026-11-27): what changed on the place (name, type — only for a place's own route from its HQ town) and on
 * the route (km, TA). Either part is left out when nothing in it changed.
 */
export function placeRouteChanges(
  place: Pick<PlaceDto, 'name' | 'type'> | null,
  route: RouteDto,
  draft: { name: string; type: RouteType; distanceKm: string; taMode: TaMode; rate: string; fixed: string },
): BuildResult<{ place?: { name?: string; type?: RouteType }; route?: UpdateRouteDto }> {
  const name = normalizeName(draft.name);
  const nameProblem = place ? nameError(name) : undefined;
  const routePart = changedPlaceRouteFields(route, draft);
  if (nameProblem || !routePart.ok) return fail({ name: nameProblem, ...(routePart.ok ? {} : routePart.errors) });
  const placePart = place ? { ...(name !== place.name && { name }), ...(draft.type !== place.type && { type: draft.type }) } : {};
  return {
    ok: true,
    body: {
      ...(Object.keys(placePart).length > 0 && { place: placePart satisfies UpdatePlaceDto }),
      ...(Object.keys(routePart.body).length > 0 && { route: routePart.body }),
    },
  };
}

/** "+ Place": the type follows the km (the server's rule) until the user picks one by hand. */
export function typeForKm(rawKm: string, thresholds: StationThresholds | null, current: RouteType | '', pickedByHand: boolean): RouteType | '' {
  if (pickedByHand) return current;
  return suggestedType(rawKm, thresholds) ?? current;
}
