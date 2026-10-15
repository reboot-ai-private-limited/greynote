import type { Paise } from '@/shared/money/paise.js';

/** A discount the office gives on one line or on the whole order: a percentage, or a flat amount off. */
export type Discount = { type: 'PERCENT'; percent: number } | { type: 'FIXED'; amountPaise: Paise };

export interface PricedLine {
  grossPaise: Paise;
  lineDiscount: Discount | null;
}

export interface LineNet {
  /** The line's own discount plus its share of the order discount. */
  discountPaise: Paise;
  netPaise: Paise;
}

/** The most a discount of this kind can take off `basePaise`; never more than the base. */
export function discountAmount(base: Paise, d: Discount | null | undefined): Paise {
  if (!d) return 0;
  const raw = d.type === 'PERCENT' ? Math.round((base * d.percent) / 100) : d.amountPaise;
  return Math.min(base, Math.max(0, raw));
}

/**
 * Net amount of every line: the line discount comes off first, then the order discount (worked out on the subtotal after line discounts)
 * is shared across the lines in proportion to what they came to, the rounding remainder going to the largest line so the shares add up exactly.
 * A flat amount larger than a line or the subtotal is refused by the caller; here it is capped.
 */
export function netLines(lines: readonly PricedLine[], orderDiscount: Discount | null | undefined): { lines: LineNet[]; orderDiscountPaise: Paise; netTotalPaise: Paise } {
  const afterLine = lines.map((l) => l.grossPaise - discountAmount(l.grossPaise, l.lineDiscount));
  const subtotal = afterLine.reduce((n, v) => n + v, 0);
  const orderDiscountPaise = discountAmount(subtotal, orderDiscount);
  const shares = afterLine.map((v) => (subtotal === 0 ? 0 : Math.floor((orderDiscountPaise * v) / subtotal)));
  let left = orderDiscountPaise - shares.reduce((n, v) => n + v, 0);
  if (left > 0 && afterLine.length > 0) {
    const biggest = afterLine.indexOf(Math.max(...afterLine));
    shares[biggest] = (shares[biggest] ?? 0) + left;
    left = 0;
  }
  const out = lines.map((l, i) => {
    const netPaise = (afterLine[i] ?? 0) - (shares[i] ?? 0);
    return { discountPaise: l.grossPaise - netPaise, netPaise };
  });
  return { lines: out, orderDiscountPaise, netTotalPaise: subtotal - orderDiscountPaise };
}

/** What a line comes to for the units that were actually supplied: its net, scaled by supplied ÷ ordered (a flat discount shrinks with the supply). */
export function suppliedNet(netPaise: Paise, quantity: number, suppliedQty: number): Paise {
  return suppliedQty >= quantity ? netPaise : Math.round((netPaise * suppliedQty) / quantity);
}
