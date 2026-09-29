import { multiplyPaise, type Paise } from '@/shared/money/paise.js';
import type { WorkingType } from '@greynote/contracts';

type AreaType = 'HQ' | 'EX_STATION' | 'OUT_STATION';

export interface DayRoute {
  id: string;
  areaType: AreaType;
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

const RANK: Record<AreaType, number> = { HQ: 0, EX_STATION: 1, OUT_STATION: 2 };

/**
 * The day's TA and DA (hld/06). Pure: the caller reads the Plan, the Routes and the Pay Band.
 *
 * - `FIELD_WORK`: one TA row **per Route** — its `distanceKm` × (the Route's own rate, else the Pay Band's),
 *   rounded half up to a whole paise once, per Route. A Route whose distance isn't `CALCULATED` (or is unknown,
 *   which the caller passes as `null`) gets a zero row flagged `distanceFlag`, never a made-up figure and never
 *   a block on approval. Plus one DA row: the Pay Band's rate for the *highest* Area type among the Routes.
 * - `MEETING` / `CONFERENCE`: DA at the HQ rate, no TA.
 * - `STRIKE`: nothing.
 * A DA of ₹0 (the HQ rate of some grades) and a genuinely zero-km TA are not written — nothing is claimed.
 */
export function calculateTaDa(workingType: WorkingType, routes: Array<DayRoute | null>, routeIds: string[], rates: PayRates): AutoExpense[] {
  if (workingType === 'STRIKE') return [];
  const out: AutoExpense[] = [];
  const known = routes.filter((r): r is DayRoute => r !== null);

  if (workingType === 'FIELD_WORK') {
    routeIds.forEach((routeId, i) => {
      const route = routes[i] ?? null;
      if (!route || route.distanceStatus !== 'CALCULATED' || route.distanceKm === null) {
        out.push({ type: 'TA', routeId, amountPaise: 0, distanceFlag: true });
        return;
      }
      const amountPaise = multiplyPaise(route.taPerKmRateOverridePaise ?? rates.taPerKmRatePaise, route.distanceKm);
      if (amountPaise > 0) out.push({ type: 'TA', routeId, amountPaise, distanceFlag: false });
    });
  }

  const dayArea = workingType === 'FIELD_WORK' ? known.reduce<AreaType>((top, r) => (RANK[r.areaType] > RANK[top] ? r.areaType : top), 'HQ') : 'HQ';
  const da = dayArea === 'OUT_STATION' ? rates.outStationDaPaise : dayArea === 'EX_STATION' ? rates.exStationDaPaise : rates.hqDaPaise;
  if (da > 0) out.push({ type: 'DA', routeId: null, amountPaise: da, distanceFlag: false });
  return out;
}
