import { multiplyPaise, type Paise } from '@/shared/money/paise.js';
import { isFieldDay, type WorkingType } from '@greynote/contracts';

type RouteType = 'HQ' | 'EX_STATION' | 'OUT_STATION';

export interface DayRoute {
  id: string;
  routeType: RouteType;
  distanceKm: string | null;
  distanceStatus: string;
  taPerKmRateOverridePaise: number | null;
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
 * A DA of ₹0 (the HQ rate of some grades) and a genuinely zero-km TA are not written — nothing is claimed.
 */
export function calculateTaDa(workingType: WorkingType, routes: Array<DayRoute | null>, routeIds: string[], rates: PayRates, maxKm: number): AutoExpense[] {
  if (workingType === 'STRIKE') return [];
  const out: AutoExpense[] = [];
  const known = routes.filter((r): r is DayRoute => r !== null);

  if (workingType === 'FIELD_WORK') {
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
      const amountPaise = multiplyPaise(route.taPerKmRateOverridePaise ?? rates.taPerKmRatePaise, (paid / 100).toFixed(2));
      if (amountPaise > 0) out.push({ type: 'TA', routeId, amountPaise, distanceFlag: false });
    }
  }

  const dayType = isFieldDay(workingType) ? known.reduce<RouteType>((top, r) => (RANK[r.routeType] > RANK[top] ? r.routeType : top), 'HQ') : 'HQ';
  const da = dayType === 'OUT_STATION' ? rates.outStationDaPaise : dayType === 'EX_STATION' ? rates.exStationDaPaise : rates.hqDaPaise;
  if (da > 0) out.push({ type: 'DA', routeId: null, amountPaise: da, distanceFlag: false });
  return out;
}
