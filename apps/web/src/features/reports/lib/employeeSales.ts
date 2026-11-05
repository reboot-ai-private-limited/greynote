import { monthLabel } from '@/features/payroll/lib/payroll';

export type Period = 'month' | 'quarter' | 'year' | 'custom';

export const PERIOD_OPTIONS = [
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'Financial year' },
  { value: 'custom', label: 'Custom months' },
] as const;

export function parsePeriod(raw: string): Period {
  return raw === 'quarter' || raw === 'year' || raw === 'custom' ? raw : 'month';
}

/**
 * The months a period covers inside a financial year (`fyMonths`, twelve `YYYY-MM` in order): this month, the three-month quarter of the year
 * that holds it, or the whole year. A month outside the year falls back to its first.
 */
export function periodMonths(
  period: Exclude<Period, 'custom'>,
  thisMonth: string,
  fyMonths: readonly string[],
): { from: string; to: string } {
  const first = fyMonths[0] ?? thisMonth;
  const last = fyMonths[fyMonths.length - 1] ?? thisMonth;
  if (period === 'year') return { from: first, to: last };
  const found = fyMonths.indexOf(thisMonth);
  const i = found < 0 ? 0 : found;
  if (period === 'month') return { from: fyMonths[i] ?? first, to: fyMonths[i] ?? first };
  const q = Math.floor(i / 3) * 3;
  return { from: fyMonths[q] ?? first, to: fyMonths[Math.min(q + 2, fyMonths.length - 1)] ?? last };
}

/** "Oct 2026" for one month, "Oct 2026 – Dec 2026" for a run. */
export const rangeLabel = (from: string, to: string): string =>
  from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;

export const SALES_CSV_HEADER = ['Product', 'SKU', 'Target (INR)', 'Primary (units)', 'Primary (INR)', 'Secondary (units)', 'Secondary (INR)', 'Achievement %'] as const;
