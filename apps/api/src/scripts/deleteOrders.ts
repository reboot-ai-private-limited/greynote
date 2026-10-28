/** Orders asked for by id that were not found, and the payment allocations that point at the ones that were. */
export interface DeletePlan {
  missing: string[];
  orderIds: string[];
  allocatedPayments: Array<{ paymentId: string; amountPaise: number }>;
}

interface OrderRef {
  _id: unknown;
}
interface PaymentRef {
  _id: unknown;
  allocations?: Array<{ orderId: unknown; amountPaise: number }>;
}

/** What deleting `ids` would touch: the orders that exist, those that do not, and the payment amounts allocated to them. */
export function planDelete(ids: readonly string[], orders: readonly OrderRef[], payments: readonly PaymentRef[]): DeletePlan {
  const found = new Set(orders.map((o) => String(o._id)));
  const wanted = new Set(ids);
  const allocatedPayments = payments.flatMap((p) =>
    (p.allocations ?? []).filter((a) => wanted.has(String(a.orderId))).map((a) => ({ paymentId: String(p._id), amountPaise: a.amountPaise })),
  );
  return { missing: ids.filter((id) => !found.has(id)), orderIds: ids.filter((id) => found.has(id)), allocatedPayments };
}
