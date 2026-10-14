import type { EditOrderDto, PlaceOrderForDto } from '@greynote/contracts';
import { paiseToRupees, rupeesToPaise } from '@/lib/money';

export const REMARKS_MAX = 1000;

export interface LineDraft {
  productId: string;
  quantity: string;
  /** Rupees as typed. */
  price: string;
}

export interface OrderDraft {
  userId: string;
  outletType: 'DISTRIBUTOR' | 'CHEMIST';
  outletId: string;
  orderDate: string;
  remarks: string;
  lines: LineDraft[];
}

export const emptyLine = (): LineDraft => ({ productId: '', quantity: '', price: '' });

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
export const linesOf = (items: ReadonlyArray<{ productId: string; quantity: number; unitPricePaise: number }>): LineDraft[] =>
  items.map((i) => ({ productId: i.productId, quantity: String(i.quantity), price: paiseToRupees(i.unitPricePaise) }));

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
    out.push({ productId: l.productId, quantity: Number(qty), unitPricePaise: price });
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
