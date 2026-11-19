import type { SecondaryReportLineDto } from '@greynote/contracts';

/** A figure in paise, or `null` when the product has no PTS (its units cannot be priced). */
export type Amount = number | null;

export interface LineAmounts {
  opening: Amount;
  primary: Amount;
  issued: Amount;
  closing: Amount;
}

/** Units priced at the product's PTS (decision-log 2026-11-19): quantity × PTS, whole paise; `null` for a product with no PTS. */
export const priced = (qty: number, ptsPaise: number | null): Amount => (ptsPaise === null ? null : qty * ptsPaise);

export const lineAmounts = (line: Pick<SecondaryReportLineDto, 'openingQty' | 'primaryQty' | 'issuedQty' | 'closingQty' | 'ptsPaise'>): LineAmounts => ({
  opening: priced(line.openingQty, line.ptsPaise),
  primary: priced(line.primaryQty, line.ptsPaise),
  issued: priced(line.issuedQty, line.ptsPaise),
  closing: priced(line.closingQty, line.ptsPaise),
});

/** The lines added up in rupees; a product with no PTS adds nothing (it is counted in `unpriced`). */
export function totalAmounts(lines: readonly Pick<SecondaryReportLineDto, 'openingQty' | 'primaryQty' | 'issuedQty' | 'closingQty' | 'ptsPaise'>[]): { opening: number; primary: number; issued: number; closing: number; unpriced: number } {
  const t = { opening: 0, primary: 0, issued: 0, closing: 0, unpriced: 0 };
  for (const l of lines) {
    const a = lineAmounts(l);
    if (a.opening === null) {
      t.unpriced += 1;
      continue;
    }
    t.opening += a.opening;
    t.primary += a.primary ?? 0;
    t.issued += a.issued ?? 0;
    t.closing += a.closing ?? 0;
  }
  return t;
}
