/**
 * Money is whole paise everywhere (₹1 = 100). Rupee text is for typing and display only. Parsing
 * works on the digits, never on floats, so ₹10.10 is exactly 1010 paise.
 */

/** ₹10 crore in paise — the server's ceiling (apps/api shared/money/paise.ts). */
export const MAX_PAISE = 10_000_000_000;

/** "125", "125.5" or "125.50" → paise; null for empty, zero, more than two decimals, or above the ceiling. */
export function rupeesToPaise(text: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  return paise > 0 && paise <= MAX_PAISE ? paise : null;
}

/** 12550 → "₹125.50" */
export function formatRupees(paise: number): string {
  const whole = Math.floor(paise / 100);
  const part = String(paise % 100).padStart(2, '0');
  return `₹${whole.toLocaleString('en-IN')}.${part}`;
}
