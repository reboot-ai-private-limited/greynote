/** How an employee's figures are selected and valued (the figures themselves are in `mrFigures.ts`). Pure: no ports, no clock. */

export interface PriceRow {
  id: string;
  name: string;
  sku: string;
  ptrPaise: number | null;
  ptsPaise: number | null;
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
export const wanted = (r: { userId: string; productId: string; month: string }, s: Selection) =>
  within(r.month, s) && (s.userId === undefined || r.userId === s.userId) && (s.userIds === undefined || s.userIds.has(r.userId)) && (s.productId === undefined || s.productId === null || r.productId === s.productId);

export interface Valued {
  qty: number;
  paise: number;
  /** Units of products with no price, which are counted but add nothing to the rupees. */
  unpricedQty: number;
}

/** Achievement as a whole percent of the target; `null` when there is no target to measure against. */
export const percentOf = (achievedPaise: number, targetPaise: number): number | null => (targetPaise > 0 ? Math.round((achievedPaise * 100) / targetPaise) : null);
