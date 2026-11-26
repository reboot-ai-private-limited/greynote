import { multiplyPaise, type Paise } from '@/shared/money/paise.js';
import { isFieldDay, type DayKind, type WorkingType } from '@greynote/contracts';

type RouteType = 'HQ' | 'EX_STATION' | 'OUT_STATION';

export interface DayRoute {
  id: string;
  routeType: RouteType;
  distanceKm: string | null;
  distanceStatus: string;
  taPerKmRateOverridePaise: number | null;
  /** A fixed TA for a day on this route (decision-log 2026-11-26): paid as typed, instead of km × rate and the cap. */
  taFixedPaise?: number | null | undefined;
}
export interface PayRates {
  taPerKmRatePaise: Paise;
  hqDaPaise: Paise;
  exStationDaPaise: Paise;
  outStationDaPaise: Paise;
}
export interface AutoExpense {
  type: 'TA' | 'DA';
  routeId: string | null;
  amountPaise: Paise;
  /** TA only: the Route's distance could not be calculated, so this amount is zero and not a real figure. */
  distanceFlag: boolean;
}

const RANK: Record<RouteType, number> = { HQ: 0, EX_STATION: 1, OUT_STATION: 2 };

/**
 * The day's TA and DA (hld/06). Pure: the caller reads the Plan, the Routes and the Pay Band.
 *
 * - `FIELD_WORK`: one TA row **per Route** — its `distanceKm` × (the Route's own rate, else the Pay Band's),
 *   rounded half up to a whole paise once, per Route. A Route whose distance isn't `CALCULATED` (or is unknown,
 *   which the caller passes as `null`) gets a zero row flagged `distanceFlag`, never a made-up figure and never
 *   a block on approval. Plus one DA row: the Pay Band's rate for the *highest* Route type among the Routes.
 * - An `HQ` Route earns no TA (the day is within the HQ town): a day on HQ Routes only is DA alone.
 * - Of the day's other Routes only the **longest** is paid TA (the first, if two tie), for at most `maxKm` (`TA_MAX_KM`) of it, at that
 *   Route's own rate. The rest get no TA row. A Route whose distance is unknown is not a candidate and keeps a zero flagged row.
 * - `DOCTOR_CAMPAIGN`: no TA; DA as for field work (the Pay Band's rate for the highest Route type).
 * - `MEETING` / `CONFERENCE`: DA at the HQ rate, no TA.
 * - `STRIKE`: nothing.
 * - Days of an out-station trip (`dayKind`): a `STAY` day is DA at the out-station rate and no TA; a `TRANSIT` day (the way back) is
 *   TA as for field work, with DA at the ex-station rate. The trip's first day is a `NORMAL` day.
 * A DA of ₹0 (the HQ rate of some grades) and a genuinely zero-km TA are not written — nothing is claimed.
 */
export function calculateTaDa(workingType: WorkingType, routes: Array<DayRoute | null>, routeIds: string[], rates: PayRates, maxKm: number, dayKind: DayKind = 'NORMAL'): AutoExpense[] {
  if (workingType === 'STRIKE') return [];
  const out: AutoExpense[] = [];
  const known = routes.filter((r): r is DayRoute => r !== null);

  if (workingType === 'FIELD_WORK' && dayKind !== 'STAY') {
    // Whole hundredths of a km (a distance has at most 2 places), so the comparison and the cap are exact.
    let longest: { routeId: string; route: DayRoute; hundredths: number } | null = null;
    routeIds.forEach((routeId, i) => {
      const route = routes[i] ?? null;
      if (route?.routeType === 'HQ') return; // no TA on an HQ Route, whatever its distance
      if (!route || route.distanceStatus !== 'CALCULATED' || route.distanceKm === null) {
        out.push({ type: 'TA', routeId, amountPaise: 0, distanceFlag: true });
        return;
      }
      const hundredths = Math.round(Number(route.distanceKm) * 100);
      if (!longest || hundredths > longest.hundredths) longest = { routeId, route, hundredths };
    });
    if (longest) {
      const { routeId, route, hundredths } = longest as { routeId: string; route: DayRoute; hundredths: number };
      const paid = Math.min(hundredths, Math.round(maxKm * 100));
      const amountPaise = route.taFixedPaise ?? multiplyPaise(route.taPerKmRateOverridePaise ?? rates.taPerKmRatePaise, (paid / 100).toFixed(2));
      if (amountPaise > 0) out.push({ type: 'TA', routeId, amountPaise, distanceFlag: false });
    }
  }

  const dayType = dayKind === 'STAY' ? 'OUT_STATION' : dayKind === 'TRANSIT' ? 'EX_STATION' : isFieldDay(workingType) ? known.reduce<RouteType>((top, r) => (RANK[r.routeType] > RANK[top] ? r.routeType : top), 'HQ') : 'HQ';
  const da = dayType === 'OUT_STATION' ? rates.outStationDaPaise : dayType === 'EX_STATION' ? rates.exStationDaPaise : rates.hqDaPaise;
  if (da > 0) out.push({ type: 'DA', routeId: null, amountPaise: da, distanceFlag: false });
  return out;
}

/** A place as the From → To rule reads it: whose HQ it is and its type there. */
export interface DayPlace {
  id: string;
  hqId: string;
  type: RouteType;
}

/** What kind of day a From → To is for the employee (decision-log 2026-11-26). */
export type PlaceDayKind = 'DAY_TRIP' | 'AWAY' | 'STAY' | 'RETURN';

/**
 * Away from home, for this employee: a place outside the HQ they are based in, or an out-station place of their own HQ. A manager working
 * in a team member's HQ is always away there.
 */
const isAway = (place: DayPlace, ownHqId: string) => place.hqId !== ownHqId || place.type === 'OUT_STATION';

export function placeDayKind(from: DayPlace, to: DayPlace, ownHqId: string): PlaceDayKind {
  const fromAway = isAway(from, ownHqId);
  const toAway = isAway(to, ownHqId);
  if (toAway) return from.id === to.id ? 'STAY' : 'AWAY';
  return fromAway ? 'RETURN' : 'DAY_TRIP';
}

/**
 * The day's TA and DA for a day planned From → To (decision-log 2026-11-26), measured against the HQ the employee is based in:
 *
 * | Day | TA | DA |
 * |---|---|---|
 * | Day trip: neither place away (they sleep at home) | the route's km **× 2**; none if To is an HQ place | To's type (HQ / Ex) |
 * | Going or moving away: To is away | the route's km, one way | Out-station |
 * | Staying: From = To, away | none | Out-station |
 * | Return: From away, To not | the route's km, one way | Ex-station |
 *
 * - km: min(km, `maxKm`) first, then × 2 on a day trip. Rate: the route's own rate per km, else the grade's. Half a paisa rounds up, once.
 * - A route with a fixed TA pays that amount as typed: never doubled or capped.
 * - `route` is the route between From and To (null when From = To). A day trip at one place (From = To, not away) is paid on `homeRoute`,
 *   the route between their HQ town and the place, there and back.
 * - A route with no km yet is a zero row flagged `distanceFlag`, never a made-up figure.
 * - A doctor campaign earns no TA; DA as above. Meetings and conferences don't come here (no places): HQ DA. A strike earns nothing.
 * - A DA of ₹0 and a genuinely zero TA are not written.
 */
export function calculatePlaceTaDa(input: {
  workingType: WorkingType;
  from: DayPlace;
  to: DayPlace;
  ownHqId: string;
  route: (DayRoute & { taFixedPaise?: number | null | undefined }) | null;
  homeRoute?: (DayRoute & { taFixedPaise?: number | null | undefined }) | null | undefined;
  rates: PayRates;
  maxKm: number;
}): AutoExpense[] {
  const { workingType, from, to, ownHqId, rates, maxKm } = input;
  if (workingType === 'STRIKE') return [];
  const kind = placeDayKind(from, to, ownHqId);
  const out: AutoExpense[] = [];

  const paysTa = workingType === 'FIELD_WORK' && kind !== 'STAY' && !(kind === 'DAY_TRIP' && to.type === 'HQ');
  const route = kind === 'DAY_TRIP' && from.id === to.id ? (input.homeRoute ?? null) : input.route;
  if (paysTa && route) {
    if (route.taFixedPaise != null) {
      if (route.taFixedPaise > 0) out.push({ type: 'TA', routeId: route.id, amountPaise: route.taFixedPaise, distanceFlag: false });
    } else if (route.distanceStatus !== 'CALCULATED' || route.distanceKm === null) {
      out.push({ type: 'TA', routeId: route.id, amountPaise: 0, distanceFlag: true });
    } else {
      const capped = Math.min(Math.round(Number(route.distanceKm) * 100), Math.round(maxKm * 100));
      const paid = kind === 'DAY_TRIP' ? capped * 2 : capped;
      const amountPaise = multiplyPaise(route.taPerKmRateOverridePaise ?? rates.taPerKmRatePaise, (paid / 100).toFixed(2));
      if (amountPaise > 0) out.push({ type: 'TA', routeId: route.id, amountPaise, distanceFlag: false });
    }
  }

  const dayType: RouteType = kind === 'AWAY' || kind === 'STAY' ? 'OUT_STATION' : kind === 'RETURN' ? 'EX_STATION' : to.type;
  const da = dayType === 'OUT_STATION' ? rates.outStationDaPaise : dayType === 'EX_STATION' ? rates.exStationDaPaise : rates.hqDaPaise;
  if (da > 0) out.push({ type: 'DA', routeId: null, amountPaise: da, distanceFlag: false });
  return out;
}
