/**
 * The Financial Year "time machine" (docs/hld/09). The selected year rides on every API request
 * as `X-Financial-Year`; a past year makes the whole panel read-only server-side. `null` means
 * "the current year" and sends no header at all.
 *
 * Module-level state with a subscription (read in React through `useFinancialYear`) so the API
 * client can read it without React.
 */

let selected: number | null = null;
type Listener = () => void;
const listeners = new Set<Listener>();

export function getFinancialYear(): number | null {
  return selected;
}

export function setFinancialYear(year: number | null): void {
  if (year === selected) return;
  selected = year;
  for (const listener of listeners) listener();
}

export function subscribeFinancialYear(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The header to send, or nothing for the current year. */
export function financialYearHeaders(): Record<string, string> {
  return selected === null ? {} : { 'X-Financial-Year': String(selected) };
}

/**
 * The year a date falls in, named by the calendar year it starts in: with an April start, 1 Oct 2026 is in 2026 and
 * 1 Feb 2027 is also in 2026. Mirrors the API's `FY_START_MONTH` (a config key with no HTTP surface yet, April by default),
 * so a change there needs the same here.
 */
export const FY_START_MONTH = 4;

export function financialYearOf(date: string, startMonth = FY_START_MONTH): number {
  const [year = 0, month = 1] = date.split('-').map(Number);
  return month >= startMonth ? year : year - 1;
}

/** First and last day (`YYYY-MM-DD`) of a financial year. */
export function financialYearRange(year: number, startMonth = FY_START_MONTH): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const from = `${year}-${pad(startMonth)}-01`;
  const end = new Date(Date.UTC(year + 1, startMonth - 1, 0)); // the day before the next year starts
  return { from, to: `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}` };
}

/** `2026–27`. */
export function financialYearLabel(year: number): string {
  return `${year}–${String(year + 1).slice(2)}`;
}
