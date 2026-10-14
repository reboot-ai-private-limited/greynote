/**
 * The slab table of a setting (professional tax by monthly salary) as the control edits it: a row per slab with the salary it starts at
 * and the amount. Where a slab ends is not typed: it is the one before the next slab starts, and the last has no end, so there can
 * never be a gap or an overlap. The draft the screen keeps is the JSON the server stores, with anything half-typed left as typed so the
 * server's own rules can say what is wrong.
 */
export interface SlabRow {
  from: string;
  amount: string;
}

const WHOLE = /^\d+$/;
const asNumber = (text: string): number | string => (WHOLE.test(text.trim()) ? Number(text.trim()) : text);

/** The rows a stored (or half-edited) draft shows; an unreadable draft shows no rows. */
export function rowsFromDraft(draft: string): SlabRow[] {
  try {
    const raw: unknown = JSON.parse(draft);
    if (!Array.isArray(raw)) return [];
    return raw.map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      return { from: row['from'] === undefined || row['from'] === null ? '' : String(row['from']), amount: row['amount'] === undefined || row['amount'] === null ? '' : String(row['amount']) };
    });
  } catch {
    return [];
  }
}

/** The draft for a set of rows: each slab ends one rupee before the next begins; the last has no end. */
export function draftFromRows(rows: readonly SlabRow[]): string {
  return JSON.stringify(
    rows.map((r, i) => {
      const next = rows[i + 1];
      const nextFrom = next === undefined ? null : asNumber(next.from);
      return { from: asNumber(r.from), to: next === undefined ? null : typeof nextFrom === 'number' ? nextFrom - 1 : '', amount: asNumber(r.amount) };
    }),
  );
}

/** "₹10,000 to ₹14,999: ₹110 · ₹15,000 to ₹19,999: ₹130 · ₹20,000 and above: ₹150". */
export function summariseSlabs(draft: string): string {
  const money = (n: unknown) => `₹${Number(n).toLocaleString('en-IN')}`;
  try {
    const raw = JSON.parse(draft) as Array<{ from: number; to: number | null; amount: number }>;
    return raw.map((s) => `${s.to === null ? `${money(s.from)} and above` : `${money(s.from)} to ${money(s.to)}`}: ${money(s.amount)}`).join(' · ');
  } catch {
    return draft;
  }
}
