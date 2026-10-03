/** Several list endpoints take a `from`/`to` of at most this many days. */
export const MAX_RANGE_DAYS = 400;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar day: `2026-13-01` and `2026-02-29` are refused (the first would make `toISOString` throw, so the date is checked first). */
export function isRealDate(v: string): boolean {
  if (!DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** A range the API will list: both ends real, in order, and not more than 400 days. */
export function rangeError(from: string, to: string): string | undefined {
  if (!isRealDate(from) || !isRealDate(to)) return 'Choose both dates.';
  if (from > to) return 'The end date is before the start date.';
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return days > MAX_RANGE_DAYS ? `Choose at most ${MAX_RANGE_DAYS} days at a time.` : undefined;
}

/** First day of the month containing `date`, and `date` itself: "this month so far". */
export function monthToDate(date: string): { from: string; to: string } {
  return { from: `${date.slice(0, 7)}-01`, to: date };
}
