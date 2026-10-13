import type { ExpenseAdjustmentDto, ExpenseReviewDayDto, ExpenseReviewRowDto } from '@greynote/contracts';
import { formatMoney } from '@/lib/format';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';

/** What the reviewer calls a row: "TA", "DA", or the employee's own claim. */
export const rowTypeLabel = (type: ExpenseReviewRowDto['type']): string => (type === 'TA' ? 'TA' : type === 'DA' ? 'DA' : 'Other');

/** One change the day's form asks for. */
export type DayOp =
  | { kind: 'edit'; id: string; amountPaise: number }
  | { kind: 'add'; type: 'TA' | 'DA'; amountPaise: number };

export interface DayForm {
  /** Row id -> the amount typed, in rupees. */
  amounts: Record<string, string>;
  /** `TA` / `DA` -> the amount typed for a day that has none. */
  adds: Partial<Record<'TA' | 'DA', string>>;
  reason: string;
}

/** The form's starting values: every row as it stands, nothing added. */
export function emptyDayForm(day: Pick<ExpenseReviewDayDto, 'rows'>): DayForm {
  return { amounts: Object.fromEntries(day.rows.map((r) => [r.id, paiseToRupees(r.amountPaise)])), adds: {}, reason: '' };
}

/** TA or DA may be added only when the day has no row of that type. */
export const addableTypes = (day: Pick<ExpenseReviewDayDto, 'rows'>): Array<'TA' | 'DA'> => (['TA', 'DA'] as const).filter((t) => !day.rows.some((r) => r.type === t));

/**
 * Turns the form into the changes to send: only rows whose amount really changed, and only additions that were filled in. A paid row
 * cannot change. Nothing changed, a bad amount or a missing reason is refused with a message for the field.
 */
export function buildDayOps(day: Pick<ExpenseReviewDayDto, 'rows'>, form: DayForm): { ok: true; ops: DayOp[]; reason: string } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const ops: DayOp[] = [];
  for (const row of day.rows) {
    if (row.paid) continue;
    const typed = form.amounts[row.id] ?? paiseToRupees(row.amountPaise);
    const paise = rupeesToPaise(typed);
    if (paise === null) errors[row.id] = 'Enter an amount in rupees, like 120 or 120.50.';
    else if (paise !== row.amountPaise) ops.push({ kind: 'edit', id: row.id, amountPaise: paise });
  }
  for (const type of addableTypes(day)) {
    const typed = form.adds[type]?.trim() ?? '';
    if (typed === '') continue;
    const paise = rupeesToPaise(typed);
    if (paise === null || paise === 0) errors[`add-${type}`] = 'Enter an amount more than zero.';
    else ops.push({ kind: 'add', type, amountPaise: paise });
  }
  const reason = form.reason.trim();
  if (Object.keys(errors).length === 0 && ops.length === 0) errors['form'] = 'Nothing has changed.';
  if (ops.length > 0 && reason === '') errors['reason'] = 'A reason is required.';
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, ops, reason };
}

/** What a day's TA/DA/Other was before HR changed it, or null if nothing of that kind was changed. */
export function wasPaise(day: Pick<ExpenseReviewDayDto, 'rows'>, kind: 'TA' | 'DA' | 'OTHER'): number | null {
  const rows = day.rows.filter((r) => (kind === 'OTHER' ? r.type !== 'TA' && r.type !== 'DA' : r.type === kind));
  if (!rows.some((r) => r.originalAmountPaise !== null)) return null;
  const was = rows.reduce((sum, r) => sum + (r.originalAmountPaise ?? r.amountPaise), 0);
  const now = rows.reduce((sum, r) => sum + r.amountPaise, 0);
  return was === now ? null : was;
}

/** "TA lowered ₹80.00 → ₹60.00", "DA added ₹30.00". */
export function describeAdjustment(a: Pick<ExpenseAdjustmentDto, 'type' | 'kind' | 'beforePaise' | 'afterPaise'>): string {
  const what = rowTypeLabel(a.type);
  if (a.kind === 'ADD') return `${what} added ${formatMoney(a.afterPaise)}`;
  return `${what} ${a.afterPaise > a.beforePaise ? 'raised' : 'lowered'} ${formatMoney(a.beforePaise)} → ${formatMoney(a.afterPaise)}`;
}
