import type { Target } from './marketing.entities.js';

/** The months `fromMonth`–`toMonth` (`YYYY-MM`, both inclusive) as a count. */
export function monthCount(fromMonth: string, toMonth: string): number {
  const [fy, fm] = fromMonth.split('-').map(Number) as [number, number];
  const [ty, tm] = toMonth.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** The months two ranges share; `0` when they do not meet. */
export function overlapMonths(a: { from: string; to: string }, b: { from: string; to: string }): number {
  const from = a.from > b.from ? a.from : b.from;
  const to = a.to < b.to ? a.to : b.to;
  return from > to ? 0 : monthCount(from, to);
}

/** The same share, in units; null when the target has none. */
export function targetShareQty(target: Pick<Target, 'month' | 'toMonth' | 'targetQty'>, window: { from: string; to: string }): number | null {
  if (target.targetQty === null) return null;
  return Math.round((target.targetQty * overlapMonths({ from: target.month, to: target.toMonth }, window)) / monthCount(target.month, target.toMonth));
}

/**
 * The part of a target that falls in a window: its amount spread evenly over its months, times the months the window shares with it. A target for
 * a quarter of ₹3 lakh is ₹1 lakh for each month of it, and the whole of it when the window is the quarter or wider.
 */
export function targetShare(target: Pick<Target, 'month' | 'toMonth' | 'targetAmountPaise'>, window: { from: string; to: string }): number {
  const shared = overlapMonths({ from: target.month, to: target.toMonth }, window);
  return Math.round((target.targetAmountPaise * shared) / monthCount(target.month, target.toMonth));
}
