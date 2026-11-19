import { apiDelete, apiGet, apiPost } from './api';

/**
 * The Marketing endpoints that are read or decided online (Visuals, Targets, and an order's
 * completion). Orders, stock counts, services and gifts are *saved* offline through the outbox instead.
 */

export type Visual = {
  id: string;
  productId: string | null;
  title: string;
  category: 'E_DETAILING' | 'CAMPAIGN_CREATIVE' | 'BRANDING' | 'OTHER';
  /** A public link to the file (image, PDF or video). */
  fileUrl: string;
  mimeType: string;
  status: 'active' | 'inactive';
};
export const listVisuals = (productId?: string) =>
  apiGet<Visual[]>(`/marketing/visuals${productId ? `?productId=${productId}` : ''}`);

/** What the MR picked to show one doctor. Only the doctor's MR (and Admin) adds (`canAdd`); a manager above the MR or Admin removes (`canRemove`). */
export type DoctorVisualList = {
  items: { visual: Visual; addedBy: string; addedByName: string | null; addedAt: string }[];
  /** Absent from an older server, which let a manager add: read as true only for someone who cannot remove. */
  canAdd?: boolean;
  canRemove: boolean;
};
export const listDoctorVisuals = (doctorId: string) => apiGet<DoctorVisualList>(`/marketing/doctors/${doctorId}/visuals`);
/** Add-only and online: adding what is already there changes nothing. Returns the doctor's list as it now stands. */
export const addDoctorVisuals = (doctorId: string, visualIds: string[]) =>
  apiPost<DoctorVisualList>(`/marketing/doctors/${doctorId}/visuals`, { visualIds }, { auth: true });
export const removeDoctorVisual = (doctorId: string, visualId: string) => apiDelete<null>(`/marketing/doctors/${doctorId}/visuals/${visualId}`);

export type TargetSummary = {
  userId: string;
  month: string;
  productId: string | null;
  campaignId: string | null;
  ownTargetPaise: number;
  downlineTargetPaise: number;
  downlineCount: number;
  effectiveTargetPaise: number;
  achievedPaise: number;
  period: { from: string; to: string };
};
export const getTarget = (userId: string, month: string, scope: { productId?: string } = {}) => {
  const q = new URLSearchParams({ month });
  if (scope.productId) q.set('productId', scope.productId);
  return apiGet<TargetSummary>(`/marketing/targets/${userId}?${q.toString()}`);
};
// Targets are set and removed only by Admin, on the web portal: the app reads them and never writes one.

/* ── Orders (reading and cancelling; placing one goes through the outbox) ── */

export type OutletType = 'CHEMIST' | 'DISTRIBUTOR';
export type OrderStatus = 'PLACED' | 'DONE' | 'CANCELLED';
export type OrderView = {
  id: string;
  userId: string;
  outlet: { type: OutletType; id: string };
  orderDate: string;
  status: OrderStatus;
  /** What the order comes to at the order's prices, after any discounts. */
  totalAmountPaise: number;
  /** A Done order: what was delivered, free units excluded. `null`/missing while Placed, once Cancelled, and on older Done orders (read as the total). */
  suppliedAmountPaise?: number | null;
  remarks: string | null;
  items: OrderItem[];
  /** What the employee originally ordered, kept the first time the office changed the order; `null`/missing if never changed. */
  originalItems?: OrderItem[] | null;
  originalTotalAmountPaise?: number | null;
  /** The office's discount on the whole order; `totalAmountPaise` is already after it. */
  discount?: Discount | null;
  orderDiscountPaise?: number;
  /** Set (a user id) when Admin or the Accountant added the order for the employee. */
  createdBy?: string | null;
  /** Set when Admin or the Accountant last changed a Placed order's lines or remarks. */
  editedBy?: string | null;
  editedAt?: string | null;
  /** Every change the office made while it was Placed, oldest first: who, when, and the lines and total it left the order with. Missing on an order changed before this was kept. */
  editHistory?: OrderEdit[] | null;
  /** A Done order's invoice: the number and the frozen amounts (supplied + GST, rounded). */
  invoiceNumber?: string | null;
  invoice?: { taxablePaise: number; gstPaise: number; roundOffPaise: number; totalPaise: number } | null;
};
export type OrderEdit = { by: string; byName: string; at: string; items: OrderItem[]; totalAmountPaise: number };
export type OrderItem = {
  productId: string;
  /** Ordered. */
  quantity: number;
  unitPricePaise: number;
  /** Ordered × price. */
  amountPaise: number;
  /** A Done order: units supplied of `quantity`; `null`/missing = all of it (Placed, or Done before supply was recorded). */
  suppliedQty?: number | null;
  /** Units given on top, free: never charged. `0`/missing = none. */
  freeQty?: number;
  /** The office's discount on this line (distributor orders); `null`/missing = none. */
  discount?: Discount | null;
  /** The line after its discount and its share of the order discount; missing = `amountPaise`. */
  netAmountPaise?: number;
  /** A Done order: the net for the units supplied; missing = read from `netAmountPaise`. */
  suppliedNetPaise?: number | null;
};
export type Discount = { type: 'PERCENT'; percent: number } | { type: 'FIXED'; amountPaise: number };
/** A discount in words for a line or the order: "5% off" or "₹50 off". */
export const discountLabel = (d: Discount | null | undefined, rupees: (paise: number) => string) => (!d ? null : d.type === 'PERCENT' ? `${d.percent}% off` : `${rupees(d.amountPaise)} off`);
/** What a line comes to, after discounts; a Done order's line for the units that arrived. */
export const lineValue = (i: OrderItem, done: boolean) => {
  const net = i.netAmountPaise ?? i.amountPaise;
  if (!done) return net;
  return i.suppliedNetPaise ?? Math.round((net * (i.suppliedQty ?? i.quantity)) / i.quantity);
};

/** What a line was delivered as: units that arrived, units given free, and units not supplied. Missing supply reads as delivered in full. */
export const deliveredOf = (i: OrderItem) => {
  const suppliedQty = i.suppliedQty ?? i.quantity;
  return { suppliedQty, freeQty: i.freeQty ?? 0, shortQty: Math.max(0, i.quantity - suppliedQty) };
};

/** One change to an order in words: each line as it was and became, and the total. */
export type OrderChange = { byName: string; at: string; lines: string[]; fromTotalPaise: number; toTotalPaise: number };
/**
 * What the office changed, step by step: the employee's original lines, then each edit, compared product by product
 * (quantity, price, and free units planned). Empty when the order was never changed, or was changed before history was kept.
 */
export function orderChanges(o: Pick<OrderView, 'originalItems' | 'originalTotalAmountPaise' | 'editHistory'>, productName: (id: string) => string, rupees: (paise: number) => string): OrderChange[] {
  const edits = o.editHistory ?? [];
  let before: OrderItem[] = o.originalItems ?? [];
  let beforeTotal = o.originalTotalAmountPaise ?? 0;
  return edits.map((e) => {
    const lines: string[] = [];
    const key = (i: OrderItem, n: number) => `${i.productId}:${before.filter((b, at) => b.productId === i.productId && at < n).length}`;
    const was = new Map(before.map((i, n) => [key(i, n), i]));
    const seen = new Set<string>();
    e.items.forEach((i, n) => {
      const k = `${i.productId}:${e.items.filter((x, at) => x.productId === i.productId && at < n).length}`;
      seen.add(k);
      const old = was.get(k);
      const name = productName(i.productId);
      if (!old) return void lines.push(`Added ${name}: ${i.quantity} × ${rupees(i.unitPricePaise)}`);
      if (old.quantity !== i.quantity) lines.push(`${name}: quantity ${old.quantity} → ${i.quantity}`);
      if (old.unitPricePaise !== i.unitPricePaise) lines.push(`${name}: price ${rupees(old.unitPricePaise)} → ${rupees(i.unitPricePaise)}`);
      if ((old.freeQty ?? 0) !== (i.freeQty ?? 0)) lines.push(`${name}: free units ${old.freeQty ?? 0} → ${i.freeQty ?? 0}`);
      if (JSON.stringify(old.discount ?? null) !== JSON.stringify(i.discount ?? null)) lines.push(`${name}: discount ${discountLabel(old.discount, rupees) ?? 'none'} → ${discountLabel(i.discount, rupees) ?? 'none'}`);
    });
    for (const [k, old] of was) if (!seen.has(k)) lines.push(`Removed ${productName(old.productId)} (${old.quantity})`);
    const change = { byName: e.byName, at: e.at, lines, fromTotalPaise: beforeTotal, toTotalPaise: e.totalAmountPaise };
    before = e.items;
    beforeTotal = e.totalAmountPaise;
    return change;
  });
}
/** The rupees an order counts for: a Done order at what was delivered (free units never charged), any other as ordered. */
export const orderValue = (o: Pick<OrderView, 'status' | 'totalAmountPaise' | 'suppliedAmountPaise'>) =>
  o.status === 'DONE' ? (o.suppliedAmountPaise ?? o.totalAmountPaise) : o.totalAmountPaise;
/** The year switch (lib/financial-year.ts) bounds this list: a past year shows that year's orders. */
export const listOrders = () => apiGet<OrderView[]>('/sales/orders', { fy: true });
// Marking an order Done is Admin / Accountant only (with an invoice number); the app can only cancel.
export const cancelOrder = (id: string) => apiPost<OrderView>(`/sales/orders/${id}/cancel`, {}, { auth: true });

/* ── Monthly stock ── */

export type StockRow = { outlet: { type: OutletType; id: string }; productId: string; month: string; openingQty: number; closingQty: number };
export const listStock = (month: string, distributorId?: string) =>
  apiGet<StockRow[]>(`/sales/monthly-stock?month=${month}${distributorId ? `&outletType=DISTRIBUTOR&outletId=${distributorId}` : ''}`);

export type MissingOutlet = { type: OutletType; id: string; name: string };
export type MissingStockRow = { userId: string; userName: string; outlets: MissingOutlet[] };
export const listMissingStock = (month: string) =>
  apiGet<MissingStockRow[]>(`/sales/monthly-stock/missing?month=${month}`, { fy: true });

/** Withdraws a Doctor Service request (same call the plans and leave use). */
export const withdrawRequest = (requestId: string) => apiPost<unknown>(`/approvals/${requestId}/withdraw`, {}, { auth: true });
