/** What an employee's figures are made of, and how they are valued. Pure: no ports, no clock. */

export interface PriceRow {
  id: string;
  name: string;
  sku: string;
  ptrPaise: number | null;
  ptsPaise: number | null;
}

/** One line of Sales' picture of an employee's Done orders to distributors (the shape of its `sumUserOrders`). */
export interface UserOrderRow {
  userId: string;
  productId: string;
  month: string;
  quantity: number;
  amountPaise: number;
}

/** What an employee entered as sold, and Admin's change to their primary (Sales' `EmployeeSale`). */
export interface EntryRow {
  userId: string;
  productId: string;
  month: string;
  secondaryQty: number | null;
  adjustmentQty: number;
}

export interface Selection {
  userId?: string;
  /** Several employees at once — a manager's figures are the sum of their MRs'. Used instead of `userId`. */
  userIds?: ReadonlySet<string>;
  /** `undefined` = every product. */
  productId?: string | null;
  /** `YYYY-MM`, both inclusive. */
  fromMonth: string;
  toMonth: string;
}

const within = (month: string, s: Selection) => month >= s.fromMonth && month <= s.toMonth;
const wanted = (r: { userId: string; productId: string; month: string }, s: Selection) =>
  within(r.month, s) && (s.userId === undefined || r.userId === s.userId) && (s.userIds === undefined || s.userIds.has(r.userId)) && (s.productId === undefined || s.productId === null || r.productId === s.productId);

export interface Valued {
  qty: number;
  paise: number;
  /** Units of products with no price, which are counted but add nothing to the rupees. */
  unpricedQty: number;
}

/** What the employee(s) entered as secondary in the selection, valued at each product's PTS. */
export function secondaryOf(entries: readonly EntryRow[], prices: ReadonlyMap<string, PriceRow>, s: Selection): Valued {
  const out: Valued = { qty: 0, paise: 0, unpricedQty: 0 };
  for (const e of entries) {
    if (!wanted(e, s) || e.secondaryQty === null) continue;
    const pts = prices.get(e.productId)?.ptsPaise ?? null;
    out.qty += e.secondaryQty;
    if (pts === null) out.unpricedQty += e.secondaryQty;
    else out.paise += e.secondaryQty * pts;
  }
  return out;
}

export interface PrimaryValued extends Valued {
  /** Of `qty`, the units Admin added or took off. */
  adjustmentQty: number;
}

/** The Done distributor orders in the selection at what they were ordered for, plus Admin's change valued at the product's PTS. */
export function primaryOf(orders: readonly UserOrderRow[], entries: readonly EntryRow[], prices: ReadonlyMap<string, PriceRow>, s: Selection): PrimaryValued {
  const out: PrimaryValued = { qty: 0, paise: 0, unpricedQty: 0, adjustmentQty: 0 };
  for (const o of orders) {
    if (!wanted(o, s)) continue;
    out.qty += o.quantity;
    out.paise += o.amountPaise;
  }
  for (const e of entries) {
    if (!wanted(e, s) || e.adjustmentQty === 0) continue;
    const pts = prices.get(e.productId)?.ptsPaise ?? null;
    out.qty += e.adjustmentQty;
    out.adjustmentQty += e.adjustmentQty;
    if (pts === null) out.unpricedQty += e.adjustmentQty;
    else out.paise += e.adjustmentQty * pts;
  }
  return out;
}

/** Achievement as a whole percent of the target; `null` when there is no target to measure against. */
export const percentOf = (achievedPaise: number, targetPaise: number): number | null => (targetPaise > 0 ? Math.round((achievedPaise * 100) / targetPaise) : null);
