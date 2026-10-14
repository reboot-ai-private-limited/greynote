/**
 * A table of amount bands, such as professional tax by monthly salary. Whole rupees; the last band has no upper end. Stored in a
 * system setting as JSON text, read by the API (to compute) and the web (to edit), so the rules live here once.
 */
export interface Slab {
  /** Lowest monthly salary in the band, whole rupees, inclusive. */
  from: number;
  /** Highest monthly salary in the band, inclusive; `null` for the last band, which has none. */
  to: number | null;
  /** The amount for the band, whole rupees. */
  amount: number;
}

/** The professional tax table the company starts with: ₹110 from ₹10,000, ₹130 from ₹15,000, ₹150 from ₹20,000. Below ₹10,000 pays nothing. */
export const DEFAULT_PTAX_SLABS = '[{"from":10000,"to":14999,"amount":110},{"from":15000,"to":19999,"amount":130},{"from":20000,"to":null,"amount":150}]';

export const MAX_SLABS = 20;
export const MAX_SLAB_RUPEES = 100_000_000;
const MAX_SLAB_AMOUNT = 100_000;

export type SlabParse = { ok: true; slabs: Slab[] } | { ok: false; error: string };

const isRupees = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_SLAB_RUPEES;

/** Reads the stored text and checks the bands hang together: rising, with no gap or overlap, and only the last one open-ended. */
export function parseSlabs(text: string): SlabParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The slabs are not valid.' };
  }
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'Add at least one slab.' };
  if (raw.length > MAX_SLABS) return { ok: false, error: `At most ${MAX_SLABS} slabs.` };
  const slabs: Slab[] = [];
  for (const [i, r] of raw.entries()) {
    const row = (r ?? {}) as Record<string, unknown>;
    const n = i + 1;
    if (!isRupees(row['from'])) return { ok: false, error: `Slab ${n}: enter the lowest salary as a whole number of rupees.` };
    const to = row['to'] === null || row['to'] === undefined ? null : row['to'];
    if (to !== null && !isRupees(to)) return { ok: false, error: `Slab ${n}: enter the highest salary as a whole number of rupees, or leave it open.` };
    if (typeof row['amount'] !== 'number' || !Number.isInteger(row['amount']) || row['amount'] < 0 || row['amount'] > MAX_SLAB_AMOUNT) {
      return { ok: false, error: `Slab ${n}: enter the amount as a whole number of rupees, up to ${MAX_SLAB_AMOUNT.toLocaleString('en-IN')}.` };
    }
    slabs.push({ from: row['from'], to, amount: row['amount'] });
  }
  for (const [i, s] of slabs.entries()) {
    const n = i + 1;
    const last = i === slabs.length - 1;
    if (s.to === null && !last) return { ok: false, error: `Slab ${n}: only the last slab can have no upper end.` };
    if (s.to !== null && last) return { ok: false, error: `Slab ${n}: the last slab must have no upper end.` };
    if (s.to !== null && s.to < s.from) return { ok: false, error: `Slab ${n}: the highest salary is below the lowest.` };
    const prev = slabs[i - 1];
    if (prev && s.from !== (prev.to ?? 0) + 1) return { ok: false, error: `Slab ${n} must start at ${((prev.to ?? 0) + 1).toLocaleString('en-IN')}, right after slab ${n - 1}.` };
  }
  return { ok: true, slabs };
}

/** The stored text for a list of slabs. */
export const serialiseSlabs = (slabs: readonly Slab[]): string => JSON.stringify(slabs.map((s) => ({ from: s.from, to: s.to, amount: s.amount })));

/** The lowest monthly salary the table covers (the first slab's start), in whole rupees. */
export const lowestSlabRupees = (slabs: readonly Slab[]): number => slabs[0]?.from ?? 0;

/**
 * The amount for a monthly salary, in paise, or `null` when the salary is below the first slab. The bands are whole rupees and
 * `to` is inclusive, so ₹14,999.50 still belongs to the band that ends at 14,999.
 */
export function slabAmountPaise(slabs: readonly Slab[], monthlyPaise: number): number | null {
  const slab = slabs.find((s) => monthlyPaise >= s.from * 100 && (s.to === null || monthlyPaise < (s.to + 1) * 100));
  return slab ? slab.amount * 100 : null;
}
