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

/** What the MR picked to show one doctor. The MR only adds; `canRemove` is true for a manager above the MR or Admin. */
export type DoctorVisualList = {
  items: { visual: Visual; addedBy: string; addedByName: string | null; addedAt: string }[];
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
};
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
