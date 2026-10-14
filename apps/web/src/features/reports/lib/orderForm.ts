import type { CompleteOrderDto, EditOrderDto, PlaceOrderForDto } from '@greynote/contracts';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';

export const REMARKS_MAX = 1000;

export interface LineDraft {
  productId: string;
  quantity: string;
  /** Rupees as typed. */
  price: string;
  /** Units to give free on top; empty = none. */
  free: string;
}

export interface OrderDraft {
  userId: string;
  outletType: 'DISTRIBUTOR' | 'CHEMIST';
  outletId: string;
  orderDate: string;
  remarks: string;
  lines: LineDraft[];
}

export const emptyLine = (): LineDraft => ({ productId: '', quantity: '', price: '', free: '' });

export const emptyOrder = (today: string): OrderDraft => ({ userId: '', outletType: 'DISTRIBUTOR', outletId: '', orderDate: today, remarks: '', lines: [emptyLine()] });

/** The price a line starts with when its product is picked: PTS for a distributor, PTR for a chemist, as the phone does. */
export function defaultPricePaise(outletType: OrderDraft['outletType'], product: { ptsPaise: number | null; ptrPaise: number | null }): number | null {
  return outletType === 'DISTRIBUTOR' ? product.ptsPaise : product.ptrPaise;
}

export const lineAmountPaise = (l: LineDraft): number | null => {
  const qty = /^\d+$/.test(l.quantity.trim()) ? Number(l.quantity) : null;
  const price = rupeesToPaise(l.price);
  return qty === null || price === null ? null : qty * price;
};

export const totalPaise = (lines: readonly LineDraft[]): number => lines.reduce((n, l) => n + (lineAmountPaise(l) ?? 0), 0);

/** An order's lines as the form starts them when it is opened for a change. */
export const linesOf = (items: ReadonlyArray<{ productId: string; quantity: number; unitPricePaise: number; freeQty?: number }>): LineDraft[] =>
  items.map((i) => ({ productId: i.productId, quantity: String(i.quantity), price: paiseToRupees(i.unitPricePaise), free: i.freeQty ? String(i.freeQty) : '' }));

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
    out.push({ productId: l.productId, quantity: Number(qty), unitPricePaise: price, freeQty: free === '' ? 0 : Number(free) });
  });
  if (lines.length === 0) errors['lines'] = 'Add at least one product.';
  return out;
}

export function buildEdit(draft: Pick<OrderDraft, 'remarks' | 'lines'>): Built<EditOrderDto> {
  const errors: Record<string, string> = {};
  const lines = buildLines(draft.lines, errors);
  if (draft.remarks.length > REMARKS_MAX) errors['remarks'] = `At most ${REMARKS_MAX} characters.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: { remarks: draft.remarks.trim() || null, lines } };
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
  return { ok: true, body: { userId: draft.userId, outletType: draft.outletType, outletId: draft.outletId, orderDate: draft.orderDate, ...edit.body } };
}

// ── Marking Done with what was supplied ─────────────────────────────────────────────────────────

export interface SupplyDraft {
  productId: string;
  /** Units ordered, for the limit and the "not supplied" figure. */
  ordered: number;
  unitPricePaise: number;
  supplied: string;
  free: string;
}

/** The form starts as a full supply with the free units the office planned (none by default): what Mark Done does with no form at all. */
export const supplyDraftOf = (items: ReadonlyArray<{ productId: string; quantity: number; unitPricePaise: number; freeQty?: number }>): SupplyDraft[] =>
  items.map((i) => ({ productId: i.productId, ordered: i.quantity, unitPricePaise: i.unitPricePaise, supplied: String(i.quantity), free: String(i.freeQty ?? 0) }));

const wholeUnits = (v: string): number | null => (/^\d+$/.test(v.trim()) ? Number(v) : null);

/** Units not supplied of what was ordered; `null` while the supplied figure is not a valid number. */
export const notSupplied = (d: SupplyDraft): number | null => {
  const s = wholeUnits(d.supplied);
  return s === null || s > d.ordered ? null : d.ordered - s;
};

/** What the supplied units come to (free units are not charged); lines with a bad figure add nothing. */
export const deliveredPaise = (drafts: readonly SupplyDraft[]): number => drafts.reduce((n, d) => n + (wholeUnits(d.supplied) ?? 0) * d.unitPricePaise, 0);

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
