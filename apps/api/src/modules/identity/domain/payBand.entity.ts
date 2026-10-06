/** A grade's name is whatever the org calls it (G1, G2 … Trainee, Senior); unique ignoring case. */
export const PAY_BAND_NAME_MAX = 20;

/**
 * Money is whole paise (₹1 = 100), plain integers — see `docs/engineering/coding-standards.md`,
 * *Money*. So ₹7.50 per km is `taPerKmRatePaise: 750`.
 *
 * DA has one rate per Route type (`HQ` / `EX_STATION` / `OUT_STATION`, see hld/06 §2).
 *
 * A grade holds no CTC: an employee's CTC is set per person and is independent of the grade (decision-log 2026-10-06).
 */
export interface PayBand {
  id: string;
  name: string;
  taPerKmRatePaise: number;
  hqDaPaise: number;
  exStationDaPaise: number;
  outStationDaPaise: number;
}

export const PAY_BAND_MONEY_FIELDS = [
  'taPerKmRatePaise',
  'hqDaPaise',
  'exStationDaPaise',
  'outStationDaPaise',
] as const satisfies readonly (keyof PayBand)[];

/** Whitespace squashed, lower-cased: what "the same name" means. */
export const payBandNameKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();
