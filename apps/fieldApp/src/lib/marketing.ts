import { apiGet, apiPost } from './api';

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
/** `toMonth` makes it a run of months (`month` to `toMonth`, both in the current financial year); left out, it is one month. */
export const setTarget = (body: { userId: string; month: string; toMonth?: string; targetAmountPaise: number; productId?: string | null }) =>
  apiPost<unknown>('/marketing/targets', body, { auth: true });

/* ── Orders (reading and finishing; placing one goes through the outbox) ── */

export type OutletType = 'CHEMIST' | 'DISTRIBUTOR';
export type OrderStatus = 'PLACED' | 'DONE' | 'CANCELLED';
export type OrderView = {
  id: string;
  userId: string;
  outlet: { type: OutletType; id: string };
  orderDate: string;
  status: OrderStatus;
  totalAmountPaise: number;
  remarks: string | null;
  items: { productId: string; quantity: number; unitPricePaise: number; amountPaise: number }[];
};
/** The year switch (lib/financial-year.ts) bounds this list: a past year shows that year's orders. */
export const listOrders = () => apiGet<OrderView[]>('/sales/orders', { fy: true });
export const completeOrder = (id: string) => apiPost<OrderView>(`/sales/orders/${id}/complete`, {}, { auth: true });
export const cancelOrder = (id: string) => apiPost<OrderView>(`/sales/orders/${id}/cancel`, {}, { auth: true });

/* ── Monthly stock ── */

export type StockRow = { outlet: { type: OutletType; id: string }; productId: string; month: string; openingQty: number; closingQty: number };
export const listStock = (month: string) => apiGet<StockRow[]>(`/sales/monthly-stock?month=${month}`);

/** Withdraws a Doctor Service request (same call the plans and leave use). */
export const withdrawRequest = (requestId: string) => apiPost<unknown>(`/approvals/${requestId}/withdraw`, {}, { auth: true });
