import type { SalesMonthDto } from '@greynote/contracts';

export type Metric = 'VALUE' | 'QTY';

/** The chart's ticks: 0 and a few round steps up to just past the largest figure. */
export function niceTicks(max: number, target = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude);
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) {
    ticks.push(Math.round(v * 100) / 100);
    if (v >= max) break;
  }
  return ticks;
}

/** Whole paise as a short rupee figure in the Indian way: `₹950`, `₹12.4 K`, `₹5.7 L`, `₹1.2 Cr`. */
export function compactRupees(paise: number): string {
  const rupees = paise / 100;
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (rupees >= 1_00_00_000) return `₹${trim(rupees / 1_00_00_000)} Cr`;
  if (rupees >= 1_00_000) return `₹${trim(rupees / 1_00_000)} L`;
  if (rupees >= 1_000) return `₹${trim(rupees / 1_000)} K`;
  return `₹${Math.round(rupees)}`;
}

/** A quantity as a short figure: `950`, `12.4k`. */
export function compactQty(n: number): string {
  if (n >= 1_000) return `${Math.round(n / 100) / 10}k`;
  return String(Math.round(n));
}

export const formatMetric = (n: number, metric: Metric): string => (metric === 'VALUE' ? compactRupees(n) : compactQty(n));

/** "Apr 26": the month a bar group stands for. */
export function monthTick(month: string): string {
  const [y = '', m = '1'] = month.split('-');
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1] ?? ''} ${y.slice(2)}`;
}

/** The two figures of a month on the chosen scale; `null` where there is nothing to draw (a future month, or no count yet). */
export function chartValues(m: SalesMonthDto, metric: Metric): { primary: number | null; secondary: number | null } {
  if (m.state === 'FUTURE') return { primary: null, secondary: null };
  return metric === 'VALUE' ? { primary: m.primaryPaise, secondary: m.secondaryPaise } : { primary: m.primaryQty, secondary: m.secondaryQty };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface BarGroup {
  month: string;
  /** The middle of the group, for its label. */
  centerX: number;
  /** The whole slot, for the hit area. */
  slot: Rect;
  primary: Rect | null;
  secondary: Rect | null;
}

export interface ChartLayout {
  ticks: Array<{ value: number; y: number }>;
  groups: BarGroup[];
  /** The value at the top of the axis. */
  top: number;
  baseline: number;
}

/** Where every bar goes: two bars side by side per month, primary then secondary, heights to the nice axis. Pure geometry. */
export function layoutBars(months: readonly SalesMonthDto[], metric: Metric, size: Size): ChartLayout {
  const values = months.map((m) => chartValues(m, metric));
  const max = Math.max(0, ...values.flatMap((v) => [v.primary ?? 0, v.secondary ?? 0]));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? 1;
  const innerH = size.height - size.top - size.bottom;
  const baseline = size.top + innerH;
  const y = (v: number) => baseline - (v / top) * innerH;
  const slotW = (size.width - size.left - size.right) / Math.max(months.length, 1);
  const barW = Math.min(22, (slotW - 10) / 2);
  return {
    ticks: ticks.map((value) => ({ value, y: y(value) })),
    top,
    baseline,
    groups: months.map((m, i) => {
      const x0 = size.left + i * slotW;
      const centerX = x0 + slotW / 2;
      const bar = (v: number | null, x: number): Rect | null => (v === null ? null : { x, y: y(v), width: barW, height: Math.max(baseline - y(v), v > 0 ? 1 : 0) });
      return { month: m.month, centerX, slot: { x: x0, y: size.top, width: slotW, height: innerH }, primary: bar(values[i]!.primary, centerX - barW - 1), secondary: bar(values[i]!.secondary, centerX + 1) };
    }),
  };
}
