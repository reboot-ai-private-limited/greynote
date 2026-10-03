/** Leave days are whole or half days, from 0 to 366: the API refuses anything else. */
export const MAX_DAYS = 366;

const NUMBER = /^\d+(\.\d+)?$/;

export function daysError(raw: string, { allowZero = true }: { allowZero?: boolean } = {}): string | undefined {
  const t = raw.trim();
  if (t === '') return 'Enter a number of days.';
  if (!NUMBER.test(t)) return 'Use a number, e.g. 12 or 12.5.';
  const n = Number(t);
  if (!Number.isInteger(n * 2)) return 'Use whole or half days only.';
  if (n > MAX_DAYS) return `Use at most ${MAX_DAYS} days.`;
  if (!allowZero && n === 0) return 'Use at least half a day.';
  return undefined;
}

/** The number a valid entry means; `null` for anything `daysError` refuses. */
export function parseDays(raw: string): number | null {
  return daysError(raw) === undefined ? Number(raw.trim()) : null;
}

/** `12`, `12.5`: no trailing `.0`. */
export function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
