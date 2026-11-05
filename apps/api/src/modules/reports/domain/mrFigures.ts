import type { SalesMonthDto } from '@greynote/contracts';
import { wanted, type PriceRow, type Selection, type Valued } from './employeeFigures.js';
import type { BreakdownRow } from './salesBreakdown.js';

/**
 * One approved MR row (decision-log 2026-11-05): an MR's own opening, primary (received) and issued (secondary) units of one product at one
 * distributor in one month. Every report figure is built from these alone, summed over MRs only, so a manager is the sum of the MRs below them
 * and nothing is counted twice (MR 2 + MR 4 = 6). Nothing approved means 0.
 */
export interface MrLine {
  userId: string;
  distributorId: string;
  productId: string;
  month: string;
  openingQty: number;
  primaryQty: number;
  issuedQty: number;
}

type Pick = (l: MrLine) => number;

function valueLines(lines: readonly MrLine[], prices: ReadonlyMap<string, PriceRow>, s: Selection, pick: Pick): Valued {
  const out: Valued = { qty: 0, paise: 0, unpricedQty: 0 };
  for (const l of lines) {
    if (!wanted(l, s)) continue;
    const qty = pick(l);
    const pts = prices.get(l.productId)?.ptsPaise ?? null;
    out.qty += qty;
    if (pts === null) out.unpricedQty += qty;
    else out.paise += qty * pts;
  }
  return out;
}

/** What the MR(s) received from the company (their own approved primary), valued at each product's PTS. */
export const primaryOfLines = (lines: readonly MrLine[], prices: ReadonlyMap<string, PriceRow>, s: Selection): Valued => valueLines(lines, prices, s, (l) => l.primaryQty);

/** What the MR(s) issued onward (their approved secondary, which is the achievement), valued at each product's PTS. */
export const secondaryOfLines = (lines: readonly MrLine[], prices: ReadonlyMap<string, PriceRow>, s: Selection): Valued => valueLines(lines, prices, s, (l) => l.issuedQty);

/** The lines as rows the product and distributor roll-ups add up, valued at PTS (a product with no PTS adds units but no rupees). */
export function toBreakdownRows(lines: readonly MrLine[], pts: ReadonlyMap<string, number | null>): Array<BreakdownRow> {
  return lines.map((l) => {
    const price = pts.get(l.productId) ?? null;
    return { month: l.month, distributorId: l.distributorId, productId: l.productId, primaryQty: l.primaryQty, primaryPaise: price === null ? 0 : l.primaryQty * price, secondaryQty: l.issuedQty, secondaryPaise: price === null ? 0 : l.issuedQty * price };
  });
}

/**
 * The twelve points of the Sales chart: for each month that has begun, the approved MR primary and secondary (0 when none), valued at PTS. A month
 * still in progress shows what is approved so far; a future month has nothing. Orders placed and not yet Done are shown beside it for information.
 */
export function buildMrMonths(input: {
  months: readonly string[];
  currentMonth: string;
  lines: readonly MrLine[];
  pts: ReadonlyMap<string, number | null>;
  expectedDistributorIds: readonly string[];
  placed: ReadonlyArray<{ month: string; quantity: number; amountPaise: number }>;
}): SalesMonthDto[] {
  const expected = new Set(input.expectedDistributorIds);
  return input.months.map((month): SalesMonthDto => {
    const state = month > input.currentMonth ? 'FUTURE' : month === input.currentMonth ? 'OPEN' : 'ENDED';
    const blank: SalesMonthDto = { month, state, primaryQty: 0, primaryPaise: 0, placedQty: 0, placedPaise: 0, secondaryQty: null, secondaryPaise: null, countedDistributors: 0, expectedDistributors: expected.size, complete: false, negativeRows: 0, unpricedRows: 0 };
    if (state === 'FUTURE') return blank;
    let primaryQty = 0;
    let primaryPaise = 0;
    let secondaryQty = 0;
    let secondaryPaise = 0;
    let unpricedRows = 0;
    const counted = new Set<string>();
    for (const l of input.lines) {
      if (l.month !== month) continue;
      const price = input.pts.get(l.productId) ?? null;
      primaryQty += l.primaryQty;
      secondaryQty += l.issuedQty;
      if (price === null) unpricedRows += 1;
      else {
        primaryPaise += l.primaryQty * price;
        secondaryPaise += l.issuedQty * price;
      }
      if (expected.has(l.distributorId)) counted.add(l.distributorId);
    }
    let placedQty = 0;
    let placedPaise = 0;
    for (const p of input.placed) if (p.month === month) {
      placedQty += p.quantity;
      placedPaise += p.amountPaise;
    }
    return { ...blank, primaryQty, primaryPaise, placedQty, placedPaise, secondaryQty, secondaryPaise, countedDistributors: counted.size, complete: expected.size > 0 && counted.size >= expected.size, unpricedRows };
  });
}
