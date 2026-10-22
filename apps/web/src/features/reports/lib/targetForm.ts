import type { EmployeeTargetFigureDto } from '@greynote/contracts';
import type { UpdateTargetBody } from '@/lib/api/endpoints/marketing';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';

/** "All products" in the product picker. */
export const ALL_PRODUCTS = 'all';

/** The target form as typed: rupees and units are text, the product is an id or `ALL_PRODUCTS`. */
export interface TargetDraft {
  productId: string;
  fromMonth: string;
  toMonth: string;
  /** Rupees. */
  amount: string;
  units: string;
}

/** A new target starts on the months in view (or the year's first month) for all products; an edit starts from the target. */
export function targetDraft(months: readonly string[], range: { from: string; to: string }, target?: EmployeeTargetFigureDto): TargetDraft {
  if (target) {
    return {
      productId: target.product?.id ?? ALL_PRODUCTS,
      fromMonth: target.fromMonth,
      toMonth: target.toMonth,
      amount: paiseToRupees(target.amountPaise),
      units: target.targetQty === null ? '' : String(target.targetQty),
    };
  }
  const fromMonth = months.includes(range.from) ? range.from : (months[0] ?? range.from);
  return { productId: ALL_PRODUCTS, fromMonth, toMonth: months.includes(range.to) ? range.to : fromMonth, amount: '', units: '' };
}

/**
 * The request body, or what's wrong. With a PTS (one product) and whole units typed, the target goes as units and the server works out the
 * amount; otherwise as the amount. The same body sets a new target (plus `userId`) and edits one.
 */
export function buildTargetBody(draft: TargetDraft, pts: number | null): { ok: true; body: UpdateTargetBody } | { ok: false; errors: { amount?: string; months?: string } } {
  const paise = rupeesToPaise(draft.amount);
  const errors = {
    ...(paise === null || paise === 0 ? { amount: 'Enter an amount in rupees, more than zero.' } : {}),
    ...(draft.toMonth < draft.fromMonth ? { months: 'The last month cannot be before the first.' } : {}),
  };
  if (Object.keys(errors).length > 0 || !paise) return { ok: false, errors };
  const units = draft.units.trim();
  return {
    ok: true,
    body: {
      month: draft.fromMonth,
      toMonth: draft.toMonth,
      productId: draft.productId === ALL_PRODUCTS ? null : draft.productId,
      ...(pts && draft.productId !== ALL_PRODUCTS && /^\d+$/.test(units) && Number(units) > 0 ? { targetQty: Number(units) } : { targetAmountPaise: paise }),
    },
  };
}
