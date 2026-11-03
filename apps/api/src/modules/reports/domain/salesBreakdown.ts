import type { SalesFiguresDto } from '@greynote/contracts';

/** The part of a statement row the roll-ups need. */
export interface BreakdownRow {
  month: string;
  distributorId: string;
  productId: string;
  primaryQty: number;
  primaryPaise: number;
  secondaryQty: number | null;
  secondaryPaise: number | null;
}

export const emptyFigures = (): SalesFiguresDto => ({ primaryQty: 0, primaryPaise: 0, secondaryQty: 0, secondaryPaise: 0 });

/** Adds a row in. A negative secondary is a counting error and, as in the statement's totals, left out. */
export function addRow(into: SalesFiguresDto, r: BreakdownRow): void {
  into.primaryQty += r.primaryQty;
  into.primaryPaise += r.primaryPaise;
  into.secondaryQty += r.secondaryQty !== null && r.secondaryQty >= 0 ? r.secondaryQty : 0;
  into.secondaryPaise += r.secondaryPaise ?? 0;
}

/** The rows added up under `keyOf`, one entry per key, so a product or a distributor is one line however many months and partners it has. */
export function groupRows(rows: readonly BreakdownRow[], keyOf: (r: BreakdownRow) => string): Map<string, SalesFiguresDto> {
  const out = new Map<string, SalesFiguresDto>();
  for (const r of rows) {
    const k = keyOf(r);
    const cur = out.get(k) ?? emptyFigures();
    addRow(cur, r);
    out.set(k, cur);
  }
  return out;
}
