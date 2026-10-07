import type { SalaryMonthDto } from '@greynote/contracts';
import { niceTicks, type Rect, type Size } from './salesChart';

export type StackView = 'COST' | 'DEDUCTIONS';

export interface StackSeries {
  key: string;
  label: string;
  /** Tailwind fill class (a design token), so the chart follows the theme. */
  className: string;
  /** Drawn with diagonal stripes: a figure that is not final. */
  hatched?: boolean;
}

/** The segments of each view, bottom to top. */
export const STACK_SERIES: Record<StackView, readonly StackSeries[]> = {
  COST: [
    { key: 'net', label: 'Net salary (finalized)', className: 'fill-accent' },
    { key: 'draftNet', label: 'Net salary (draft)', className: 'fill-accent', hatched: true },
    { key: 'ta', label: 'TA', className: 'fill-warning' },
    { key: 'da', label: 'DA', className: 'fill-success' },
    { key: 'reimbursement', label: 'Reimbursements', className: 'fill-text-subtle' },
  ],
  DEDUCTIONS: [
    { key: 'leave', label: 'Unpaid leave', className: 'fill-warning' },
    { key: 'absent', label: 'Absent days', className: 'fill-danger' },
  ],
};

/** What each segment of a month is worth in paise; a month that has not started has nothing, and one in progress has only what is already claimed. */
export function segmentValues(m: SalaryMonthDto, view: StackView): Record<string, number> {
  if (m.state === 'FUTURE') return {};
  if (view === 'DEDUCTIONS') return { leave: m.leaveDeductionPaise, absent: m.absentDeductionPaise };
  return { net: m.netPaise, draftNet: m.draftNetPaise, ta: m.taPaise, da: m.daPaise, reimbursement: m.reimbursementPaise };
}

export interface StackSegment {
  series: StackSeries;
  value: number;
  rect: Rect;
}

export interface StackGroup {
  month: string;
  centerX: number;
  slot: Rect;
  total: number;
  segments: StackSegment[];
}

export interface StackLayout {
  ticks: Array<{ value: number; y: number }>;
  groups: StackGroup[];
  top: number;
  baseline: number;
}

/** Where every segment goes: one bar per month, segments stacked bottom to top in series order, heights to the nice axis. Pure geometry. */
export function layoutStacks(months: readonly SalaryMonthDto[], view: StackView, size: Size): StackLayout {
  const series = STACK_SERIES[view];
  const values = months.map((m) => segmentValues(m, view));
  const totals = values.map((v) => series.reduce((n, s) => n + (v[s.key] ?? 0), 0));
  const ticks = niceTicks(Math.max(0, ...totals));
  const top = ticks[ticks.length - 1] ?? 1;
  const innerH = size.height - size.top - size.bottom;
  const baseline = size.top + innerH;
  const slotW = (size.width - size.left - size.right) / Math.max(months.length, 1);
  const barW = Math.min(36, slotW - 14);
  return {
    top,
    baseline,
    ticks: ticks.map((value) => ({ value, y: baseline - (value / top) * innerH })),
    groups: months.map((m, i) => {
      const x0 = size.left + i * slotW;
      const centerX = x0 + slotW / 2;
      let acc = 0;
      const segments: StackSegment[] = [];
      for (const s of series) {
        const value = values[i]![s.key] ?? 0;
        if (value <= 0) continue;
        const height = (value / top) * innerH;
        segments.push({ series: s, value, rect: { x: centerX - barW / 2, y: baseline - ((acc + value) / top) * innerH, width: barW, height } });
        acc += value;
      }
      return { month: m.month, centerX, slot: { x: x0, y: size.top, width: slotW, height: innerH }, total: totals[i]!, segments };
    }),
  };
}
