import type { EmployeeSalesLineDto, SaveEmployeePrimaryDto, SaveEmployeeSecondaryDto } from '@greynote/contracts';
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

/** What one row of the entry grid holds while it is being edited, as typed. */
export interface MonthDraft {
  /** The primary total Admin wants: orders plus the change. */
  primary: string;
  reason: string;
  secondary: string;
}

const WHOLE = /^\d+$/;
/** A whole number from what was typed, `null` when empty, `NaN` when it is not a whole number. */
const parse = (raw: string): number | null => {
  const t = raw.trim();
  if (t === '') return null;
  return WHOLE.test(t) ? Number(t) : Number.NaN;
};

export const draftOf = (l: EmployeeSalesLineDto): MonthDraft => ({
  primary: String(l.primaryQty),
  reason: l.adjustmentReason ?? '',
  secondary: l.secondaryQty === null ? '' : String(l.secondaryQty),
});

/** The change to the orders that the typed primary total means (`NaN` when it is not a number). */
export const adjustmentOf = (l: EmployeeSalesLineDto, d: MonthDraft): number => {
  const total = parse(d.primary);
  return total === null ? 0 : total - l.orderPrimaryQty;
};

const secondaryChanged = (l: EmployeeSalesLineDto, d: MonthDraft): boolean => parse(d.secondary) !== null && parse(d.secondary) !== l.secondaryQty;
const primaryChanged = (l: EmployeeSalesLineDto, d: MonthDraft): boolean => {
  const adjustment = adjustmentOf(l, d);
  return adjustment !== l.adjustmentQty || (adjustment !== 0 && d.reason.trim() !== (l.adjustmentReason ?? ''));
};

export const isDirty = (l: EmployeeSalesLineDto, d: MonthDraft, canAdjust: boolean): boolean =>
  secondaryChanged(l, d) || (canAdjust && primaryChanged(l, d));

/** Per-field messages for a row; empty when it can be saved. */
export function rowErrors(l: EmployeeSalesLineDto, d: MonthDraft, canAdjust: boolean): Partial<Record<keyof MonthDraft, string>> {
  const out: Partial<Record<keyof MonthDraft, string>> = {};
  if (Number.isNaN(parse(d.secondary))) out.secondary = 'Use a whole number.';
  if (canAdjust) {
    const total = parse(d.primary);
    if (Number.isNaN(total) || total === null) out.primary = 'Use a whole number.';
    else if (adjustmentOf(l, d) !== 0 && d.reason.trim() === '') out.reason = 'Say why.';
  }
  return out;
}

/** The secondary of the rows that changed, or `null` when nothing did. */
export function buildSecondary(userId: string, month: string, lines: readonly EmployeeSalesLineDto[], drafts: ReadonlyMap<string, MonthDraft>): SaveEmployeeSecondaryDto | null {
  const changed = lines.flatMap((l) => {
    const d = drafts.get(l.product.id);
    return d && secondaryChanged(l, d) ? [{ productId: l.product.id, qty: Number(d.secondary.trim()) }] : [];
  });
  return changed.length ? { userId, month, lines: changed } : null;
}

/** Admin's changes to primary for the rows that changed, or `null` when nothing did. */
export function buildPrimary(userId: string, month: string, lines: readonly EmployeeSalesLineDto[], drafts: ReadonlyMap<string, MonthDraft>): SaveEmployeePrimaryDto | null {
  const changed = lines.flatMap((l) => {
    const d = drafts.get(l.product.id);
    if (!d || !primaryChanged(l, d)) return [];
    const adjustmentQty = adjustmentOf(l, d);
    return [{ productId: l.product.id, adjustmentQty, reason: adjustmentQty === 0 ? null : d.reason.trim() }];
  });
  return changed.length ? { userId, month, lines: changed } : null;
}

export const SALES_CSV_HEADER = ['Product', 'SKU', 'Target (INR)', 'Primary (units)', 'Primary (INR)', 'Secondary (units)', 'Secondary (INR)', 'Achievement %'] as const;
