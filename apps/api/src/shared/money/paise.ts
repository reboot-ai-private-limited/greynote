import { z } from 'zod';

/**
 * Money is a whole number of paise (₹1 = 100), a plain integer everywhere — storage, domain and API
 * (docs/engineering/coding-standards.md, *Money*). Name a money field `…Paise`. Rupee decimals are
 * for display only.
 */
export type Paise = number;

/** ₹10 crore — far above any salary, allowance or order, so a typo like an extra `0` is caught. */
export const MAX_PAISE = 10_000_000_000;

export const isPaise = (value: unknown): value is Paise =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_PAISE;

/** A request field holding money: a whole non-negative number of paise. A decimal is a 400, never a silent rounding. */
export const paiseSchema = z
  .number({ invalid_type_error: 'Must be a whole number of paise.' })
  .int('Must be a whole number of paise.')
  .min(0)
  .max(MAX_PAISE);

/**
 * `paise × factor`, rounded **half up to a whole paise once**, exactly — no floating point. For TA:
 * `multiplyPaise(ratePaisePerKm, distanceKm)`. `factor` is a non-negative decimal string
 * (`"12.34"`, the shape `Route.distanceKm` has); round where the amount is created and store the
 * integer, never round a running total.
 */
export function multiplyPaise(paise: Paise, factor: string): Paise {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(factor);
  if (!isPaise(paise) || !match) throw new RangeError(`Not a paise amount and a non-negative decimal: ${paise} × ${factor}`);
  const fraction = match[2] ?? '';
  const scale = 10n ** BigInt(fraction.length);
  const scaled = BigInt(match[1]! + fraction);
  const product = BigInt(paise) * scaled;
  const rounded = (product * 2n + scale) / (scale * 2n); // floor(product / scale + ½)
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new RangeError(`Amount out of range: ${paise} × ${factor}`);
  return result;
}

/**
 * `paise × numerator ÷ denominator` for whole numbers, rounded **half up to a whole paise once**, exactly — no floating
 * point. For a share of a monthly amount: leave deduction is `proratePaise(base, halfDays, 60)`.
 */
export function proratePaise(paise: Paise, numerator: number, denominator: number): Paise {
  if (!isPaise(paise) || !Number.isSafeInteger(numerator) || numerator < 0 || !Number.isSafeInteger(denominator) || denominator < 1) {
    throw new RangeError(`Not a paise amount and a whole ratio: ${paise} × ${numerator} ÷ ${denominator}`);
  }
  const d = BigInt(denominator);
  const result = Number((BigInt(paise) * BigInt(numerator) * 2n + d) / (d * 2n)); // floor(x / d + ½)
  if (!Number.isSafeInteger(result)) throw new RangeError(`Amount out of range: ${paise} × ${numerator} ÷ ${denominator}`);
  return result;
}

/** A rupee amount typed as a decimal string (`"1234.5"`, up to 2 places) → exact paise; `null` if it isn't one. For migrating old data and importing files. */
export function rupeesToPaise(value: string): Paise | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return isPaise(paise) ? paise : null;
}

/** `123456` → `₹1,234.56`. For logs, messages and exports — never parse it back. */
export function formatPaise(paise: Paise): string {
  const rupees = Math.floor(paise / 100);
  const remainder = String(paise % 100).padStart(2, '0');
  return `₹${new Intl.NumberFormat('en-IN').format(rupees)}.${remainder}`;
}
