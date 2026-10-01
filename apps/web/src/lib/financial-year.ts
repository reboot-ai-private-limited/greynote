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
