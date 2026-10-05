import { proratePaise } from '@/shared/money/paise.js';

/** A grade's name is whatever the org calls it (G1, G2 … Trainee, Senior); unique ignoring case. */
export const PAY_BAND_NAME_MAX = 20;

/**
 * Money is whole paise (₹1 = 100), plain integers — see `docs/engineering/coding-standards.md`,
 * *Money*. So ₹7.50 per km is `taPerKmRatePaise: 750`.
 *
 * DA has one rate per Route type (`HQ` / `EX_STATION` / `OUT_STATION`, see hld/06 §2).
 *
 * The CTC range is what an employee on this grade may be paid a year (inclusive both ends): assigning a CTC outside it is
 * refused. The average is derived (`averageCtcPaise`), never stored.
 */
export interface PayBand {
  id: string;
  name: string;
  ctcMinAnnualPaise: number;
  ctcMaxAnnualPaise: number;
  taPerKmRatePaise: number;
  hqDaPaise: number;
  exStationDaPaise: number;
  outStationDaPaise: number;
}

export const PAY_BAND_MONEY_FIELDS = [
  'ctcMinAnnualPaise',
  'ctcMaxAnnualPaise',
  'taPerKmRatePaise',
  'hqDaPaise',
  'exStationDaPaise',
  'outStationDaPaise',
] as const satisfies readonly (keyof PayBand)[];

/** Whitespace squashed, lower-cased: what "the same name" means. */
export const payBandNameKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** The midpoint of the range, half up. */
export const averageCtcPaise = (band: Pick<PayBand, 'ctcMinAnnualPaise' | 'ctcMaxAnnualPaise'>): number =>
  proratePaise(band.ctcMinAnnualPaise + band.ctcMaxAnnualPaise, 1, 2);

/** Why a range can't be used, or `null` when it can: both ends are positive and the minimum is not above the maximum. */
export function ctcRangeProblem(band: Pick<PayBand, 'ctcMinAnnualPaise' | 'ctcMaxAnnualPaise'>): string | null {
  if (band.ctcMinAnnualPaise <= 0) return 'The minimum CTC must be more than zero.';
  if (band.ctcMinAnnualPaise > band.ctcMaxAnnualPaise) return 'The minimum CTC cannot be above the maximum.';
  return null;
}
