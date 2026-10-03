export const PAY_BAND_NAMES = ['G1', 'G2', 'G3'] as const;
export type PayBandName = (typeof PAY_BAND_NAMES)[number];

/**
 * Money is whole paise (₹1 = 100), plain integers — see `docs/engineering/coding-standards.md`,
 * *Money*. So ₹7.50 per km is `taPerKmRatePaise: 750`.
 *
 * DA has one rate per Route type (`HQ` / `EX_STATION` / `OUT_STATION`, see hld/06 §2).
 */
export interface PayBand {
  id: string;
  name: PayBandName;
  baseSalaryPaise: number;
  taPerKmRatePaise: number;
  hqDaPaise: number;
  exStationDaPaise: number;
  outStationDaPaise: number;
}

export const PAY_BAND_MONEY_FIELDS = [
  'baseSalaryPaise',
  'taPerKmRatePaise',
  'hqDaPaise',
  'exStationDaPaise',
  'outStationDaPaise',
] as const satisfies readonly (keyof PayBand)[];
