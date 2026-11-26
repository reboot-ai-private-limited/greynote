import type { PayBandDto, RouteType } from '@greynote/contracts';
import { parseKm } from './routeDraft';

/**
 * What one route pays, per pay grade — the same rule as the server's `calculateTaDa` for a day on this single route:
 * TA = min(km, TA_MAX_KM) × rate per km (the route's own rate if set, else the grade's), rounded half up to whole paise;
 * an HQ route earns no TA; DA is the grade's HQ / Ex-station / Out-station amount for the route's type.
 * The km is one way and never doubled. Keep this in step with `taDaCalculator.ts`; `routePay.test.ts` pins the same figures.
 */
export interface RoutePayRow {
  gradeId: string;
  gradeName: string;
  /** The per-km rate actually used. */
  taRatePaise: number;
  /** True when the route's own rate (or fixed amount) replaced the grade's. */
  overridden: boolean;
  taPaise: number;
  /** A day trip (2026-11-26: home the same night) pays the capped km there and back; a fixed amount stays as typed. */
  dayTripTaPaise: number;
  /** Null when the route's type is not known yet (Automatic with no km). */
  daPaise: number | null;
  totalPaise: number | null;
}

export interface RoutePayPreview {
  /** Null while the km is empty or not a number. */
  paidKm: number | null;
  /** The km typed is more than the cap, so part of it is not paid. */
  capped: boolean;
  /** The cap that was applied; null when the settings have not loaded. */
  capKm: number | null;
  noTa: boolean;
  rows: RoutePayRow[];
}

const DA_FIELD = { HQ: 'hqDaPaise', EX_STATION: 'exStationDaPaise', OUT_STATION: 'outStationDaPaise' } as const;

export function routePayPreview(input: {
  distanceKm: string;
  type: RouteType | null;
  overridePaise: number | null;
  /** A fixed TA for the day: paid as typed, instead of km × rate and the cap (2026-11-26). */
  fixedPaise?: number | null | undefined;
  capKm: number | null;
  grades: readonly PayBandDto[];
}): RoutePayPreview {
  const km = parseKm(input.distanceKm);
  const typedHundredths = km.ok ? Math.round(Number(km.km) * 100) : null;
  const capHundredths = input.capKm === null ? null : Math.round(input.capKm * 100);
  const paidHundredths = typedHundredths === null ? null : capHundredths === null ? typedHundredths : Math.min(typedHundredths, capHundredths);
  const noTa = input.type === 'HQ';
  const rows = [...input.grades]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g): RoutePayRow => {
      const taRatePaise = input.overridePaise ?? g.taPerKmRatePaise;
      const fixed = input.fixedPaise ?? null;
      const taPaise = noTa ? 0 : fixed !== null ? fixed : paidHundredths === null ? 0 : Math.floor((taRatePaise * paidHundredths + 50) / 100);
      const dayTripTaPaise = noTa ? 0 : fixed !== null ? fixed : paidHundredths === null ? 0 : Math.floor((taRatePaise * paidHundredths * 2 + 50) / 100);
      const daPaise = input.type ? g[DA_FIELD[input.type]] : null;
      return { gradeId: g.id, gradeName: g.name, taRatePaise, overridden: input.overridePaise !== null || fixed !== null, taPaise, dayTripTaPaise, daPaise, totalPaise: daPaise === null ? null : taPaise + daPaise };
    });
  return {
    paidKm: paidHundredths === null ? null : paidHundredths / 100,
    capped: typedHundredths !== null && capHundredths !== null && typedHundredths > capHundredths,
    capKm: input.capKm,
    noTa,
    rows,
  };
}
