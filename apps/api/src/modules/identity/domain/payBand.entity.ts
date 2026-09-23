export const PAY_BAND_NAMES = ['G1', 'G2', 'G3'] as const;
export type PayBandName = (typeof PAY_BAND_NAMES)[number];

/**
 * Money fields are decimal STRINGS here — domain/ never imports Mongoose (2026-09-19 decision),
 * so the `Decimal128` conversion happens only in `infrastructure/mongoPayBand.adapter.ts`.
 */
export interface PayBand {
  id: string;
  name: PayBandName;
  baseSalary: string;
  taPerKmRate: string;
  daAmount: string;
}

/** Non-negative, up to 2 decimal places — what `Decimal128` can represent losslessly for money. */
export function isValidDecimalString(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value);
}
