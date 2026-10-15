import type { CompleteOrderDto, DiscountDto, EditOrderDto, PlaceOrderForDto } from '@greynote/contracts';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';

export const REMARKS_MAX = 1000;

export interface LineDraft {
  productId: string;
  quantity: string;
  /** Rupees as typed. */
  price: string;
  /** Units to give free on top; empty = none. */
  free: string;
  /** Discount on this line: none, a percentage, or a flat rupee amount. */
  discKind: DiscKind;
  /** Percent or rupees as typed, by `discKind`. */
  discValue: string;
}

export type DiscKind = '' | 'PERCENT' | 'FIXED';

export interface OrderDraft {
  userId: string;
  outletType: 'DISTRIBUTOR' | 'CHEMIST';
  outletId: string;
  orderDate: string;
  remarks: string;
  lines: LineDraft[];
  /** Discount on the whole order. */
  discKind: DiscKind;
  discValue: string;
}

export const emptyLine = (): LineDraft => ({
  productId: '',
  quantity: '',
  price: '',
  free: '',
  discKind: '',
  discValue: '',
});

export const emptyOrder = (today: string): OrderDraft => ({
  userId: '',
  outletType: 'DISTRIBUTOR',
  outletId: '',
  orderDate: today,
  remarks: '',
  lines: [emptyLine()],
  discKind: '',
  discValue: '',
});

/** The price a line starts with when its product is picked: PTS for a distributor, PTR for a chemist, as the phone does. */
export function defaultPricePaise(outletType: OrderDraft['outletType'], product: { ptsPaise: number | null; ptrPaise: number | null }): number | null {
  return outletType === 'DISTRIBUTOR' ? product.ptsPaise : product.ptrPaise;
}

export const lineAmountPaise = (l: LineDraft): number | null => {
  const qty = /^\d+$/.test(l.quantity.trim()) ? Number(l.quantity) : null;
  const price = rupeesToPaise(l.price);
  return qty === null || price === null ? null : qty * price;
};

/** A typed discount as the API takes it; `null` when none is chosen, `undefined` when what was typed is not valid. */
export function parseDiscount(kind: DiscKind, value: string): DiscountDto | null | undefined {
  if (kind === '') return null;
  if (kind === 'PERCENT') {
    const v = value.trim();
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(v) || Number(v) <= 0 || Number(v) > 100) return undefined;
    return { type: 'PERCENT', percent: Number(v) };
  }
  const paise = rupeesToPaise(value);
  return paise === null || paise <= 0 ? undefined : { type: 'FIXED', amountPaise: paise };
}

const cut = (base: number, d: DiscountDto | null | undefined): number => (!d ? 0 : Math.min(base, d.type === 'PERCENT' ? Math.round((base * d.percent) / 100) : d.amountPaise));

/** The preview of what the server will work out: each line after its own discount, then the order discount shared in proportion. */
export function previewNet(lines: readonly LineDraft[], order: Pick<OrderDraft, 'discKind' | 'discValue'>): { lines: Array<number | null>; orderDiscountPaise: number; totalPaise: number } {
  const after = lines.map((l) => {
    const gross = lineAmountPaise(l);
    return gross === null ? null : gross - cut(gross, parseDiscount(l.discKind, l.discValue));
  });
  const subtotal = after.reduce<number>((n, v) => n + (v ?? 0), 0);
  const orderDiscountPaise = cut(subtotal, parseDiscount(order.discKind, order.discValue));
  const shares = after.map((v) => (subtotal === 0 || v === null ? 0 : Math.floor((orderDiscountPaise * v) / subtotal)));
  const left = orderDiscountPaise - shares.reduce((n, v) => n + v, 0);
  const biggest = after.reduce<number>((best, v, i) => ((v ?? -1) > (after[best] ?? -1) ? i : best), 0);
  if (left > 0 && shares.length > 0) shares[biggest] = (shares[biggest] ?? 0) + left;
  return {
    lines: after.map((v, i) => (v === null ? null : v - (shares[i] ?? 0))),
    orderDiscountPaise,
    totalPaise: subtotal - orderDiscountPaise,
  };
}

/** The order's total after all discounts. */
export const totalPaise = (lines: readonly LineDraft[], order: Pick<OrderDraft, 'discKind' | 'discValue'> = { discKind: '', discValue: '' }): number => previewNet(lines, order).totalPaise;

/** The discount as the form starts it: kind and the number typed. */
export function discDraftOf(d: DiscountDto | null | undefined): {
  discKind: DiscKind;
  discValue: string;
} {
  return !d ? { discKind: '', discValue: '' } : d.type === 'PERCENT' ? { discKind: 'PERCENT', discValue: String(d.percent) } : { discKind: 'FIXED', discValue: paiseToRupees(d.amountPaise) };
}

/** An order's lines as the form starts them when it is opened for a change. */
export const linesOf = (
  items: ReadonlyArray<{
    productId: string;
    quantity: number;
    unitPricePaise: number;
    freeQty?: number;
    discount?: DiscountDto | null;
  }>,
): LineDraft[] =>
  items.map((i) => ({
    productId: i.productId,
    quantity: String(i.quantity),
    price: paiseToRupees(i.unitPricePaise),
    free: i.freeQty ? String(i.freeQty) : '',
    ...discDraftOf(i.discount),
  }));

type Built<T> = { ok: true; body: T } | { ok: false; errors: Record<string, string> };

function buildLines(lines: readonly LineDraft[], errors: Record<string, string>): EditOrderDto['lines'] {
  const out: EditOrderDto['lines'] = [];
  const seen = new Set<string>();
  lines.forEach((l, i) => {
    if (!l.productId) return void (errors[`line${i}`] = 'Choose a product.');
    if (seen.has(l.productId)) return void (errors[`line${i}`] = 'This product is already on the order.');
    seen.add(l.productId);
    const qty = l.quantity.trim();
    if (!/^\d+$/.test(qty) || Number(qty) < 1) return void (errors[`line${i}`] = 'Quantity must be a whole number, at least 1.');
    const price = rupeesToPaise(l.price);
    if (price === null) return void (errors[`line${i}`] = 'Enter the price in rupees, e.g. 12.50.');
    const free = l.free.trim();
    if (free !== '' && !/^\d+$/.test(free)) return void (errors[`line${i}`] = 'Free units must be a whole number, 0 or more.');
    const discount = parseDiscount(l.discKind, l.discValue);
    if (discount === undefined)
      return void (errors[`line${i}`] = l.discKind === 'PERCENT' ? 'Discount must be a percentage above 0, up to 100, with at most two decimals.' : 'Enter the discount in rupees, e.g. 50.');
    if (discount?.type === 'FIXED' && discount.amountPaise > Number(qty) * price) return void (errors[`line${i}`] = 'A flat discount cannot be more than the line’s amount.');
    out.push({
      productId: l.productId,
      quantity: Number(qty),
      unitPricePaise: price,
      freeQty: free === '' ? 0 : Number(free),
      ...(discount && { discount }),
    });
  });
  if (lines.length === 0) errors['lines'] = 'Add at least one product.';
  return out;
}

export function buildEdit(draft: Pick<OrderDraft, 'remarks' | 'lines' | 'discKind' | 'discValue'>): Built<EditOrderDto> {
  const errors: Record<string, string> = {};
  const lines = buildLines(draft.lines, errors);
  const discount = parseDiscount(draft.discKind, draft.discValue);
  if (discount === undefined)
    errors['discount'] = draft.discKind === 'PERCENT' ? 'Discount must be a percentage above 0, up to 100, with at most two decimals.' : 'Enter the discount in rupees, e.g. 500.';
  else if (discount?.type === 'FIXED' && Object.keys(errors).length === 0 && discount.amountPaise > previewNet(draft.lines, { discKind: '', discValue: '' }).totalPaise)
    errors['discount'] = 'A flat discount cannot be more than the order’s amount after line discounts.';
  if (draft.remarks.length > REMARKS_MAX) errors['remarks'] = `At most ${REMARKS_MAX} characters.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    body: { remarks: draft.remarks.trim() || null, lines, ...(discount && { discount }) },
  };
}

export function buildNewOrder(draft: OrderDraft, today: string): Built<PlaceOrderForDto> {
  const errors: Record<string, string> = {};
  if (!draft.userId) errors['userId'] = 'Choose the employee this order is credited to.';
  if (!draft.outletId) errors['outletId'] = draft.outletType === 'DISTRIBUTOR' ? 'Choose the distributor.' : 'Choose the chemist.';
  if (!draft.orderDate) errors['orderDate'] = 'Enter the order date.';
  else if (draft.orderDate > today) errors['orderDate'] = 'An order cannot be dated in the future.';
  const edit = buildEdit(draft);
  if (!edit.ok) Object.assign(errors, edit.errors);
  if (Object.keys(errors).length > 0 || !edit.ok) return { ok: false, errors };
  return {
    ok: true,
    body: {
      userId: draft.userId,
      outletType: draft.outletType,
      outletId: draft.outletId,
      orderDate: draft.orderDate,
      ...edit.body,
    },
  };
}

// ── Marking Done with what was supplied ─────────────────────────────────────────────────────────

export interface SupplyDraft {
  productId: string;
  /** Units ordered, for the limit and the "not supplied" figure. */
  ordered: number;
  unitPricePaise: number;
  /** The line after discounts for the whole ordered quantity; a partial supply takes the same share of it. */
  netPaise: number;
  supplied: string;
  free: string;
}

/** The form starts as a full supply with the free units the office planned (none by default): what Mark Done does with no form at all. */
export const supplyDraftOf = (
  items: ReadonlyArray<{
    productId: string;
    quantity: number;
    unitPricePaise: number;
    netAmountPaise?: number;
    freeQty?: number;
  }>,
): SupplyDraft[] =>
  items.map((i) => ({
    productId: i.productId,
    ordered: i.quantity,
    unitPricePaise: i.unitPricePaise,
    netPaise: i.netAmountPaise ?? i.quantity * i.unitPricePaise,
    supplied: String(i.quantity),
    free: String(i.freeQty ?? 0),
  }));

const wholeUnits = (v: string): number | null => (/^\d+$/.test(v.trim()) ? Number(v) : null);

/** Units not supplied of what was ordered; `null` while the supplied figure is not a valid number. */
export const notSupplied = (d: SupplyDraft): number | null => {
  const s = wholeUnits(d.supplied);
  return s === null || s > d.ordered ? null : d.ordered - s;
};

/** What the supplied units come to after discounts (free units are not charged); lines with a bad figure add nothing. */
export const deliveredPaise = (drafts: readonly SupplyDraft[]): number =>
  drafts.reduce((n, d) => {
    const q = wholeUnits(d.supplied);
    if (q === null || q > d.ordered) return n;
    return n + (q === d.ordered ? d.netPaise : Math.round((d.netPaise * q) / d.ordered));
  }, 0);

export function buildSupply(drafts: readonly SupplyDraft[]): Built<CompleteOrderDto> {
  const errors: Record<string, string> = {};
  const supply: NonNullable<CompleteOrderDto['supply']> = [];
  drafts.forEach((d, i) => {
    const supplied = wholeUnits(d.supplied);
    const free = wholeUnits(d.free);
    if (supplied === null || supplied > d.ordered) return void (errors[`line${i}`] = `Supplied must be a whole number from 0 to ${d.ordered}.`);
    if (free === null) return void (errors[`line${i}`] = 'Free units must be a whole number, 0 or more.');
    supply.push({ productId: d.productId, suppliedQty: supplied, freeQty: free });
  });
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: { supply } };
}
