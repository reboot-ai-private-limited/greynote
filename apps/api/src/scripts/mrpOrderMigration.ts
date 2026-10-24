import { netLines, suppliedNet, type Discount } from '../modules/sales/domain/orderDiscount.js';

/**
 * An MR's order priced at the MRP (a phone with a stale catalogue fell back to it) is repriced at the product's PTS for a distributor, PTR for a
 * chemist (decision-log 2026-10-24). Works out what to write for one stored order. Only a line priced exactly at the MRP is touched; an order the
 * office has changed (`editedBy`) or a cancelled one is left alone. The first copy of the lines is kept in `originalItems` as when the office edits.
 */
export interface OrderLineDoc {
  productId: unknown;
  quantity: number;
  unitPricePaise: number;
  amountPaise: number;
  discount?: Discount | null;
  freeQty?: number;
  suppliedQty?: number | null;
  netAmountPaise?: number;
  suppliedNetPaise?: number | null;
}

export interface OrderDoc {
  status: string;
  distributorId?: unknown;
  editedBy?: unknown;
  discount?: Discount | null;
  totalAmountPaise: number;
  originalItems?: OrderLineDoc[] | null;
  items: OrderLineDoc[];
}

export interface ProductPrices {
  ptsPaise: number | null;
  ptrPaise: number | null;
  mrpPaise: number | null;
}

export interface OrderPatch {
  set: Record<string, unknown>;
  /** One line per repriced line, for the report. */
  changes: Array<{ productId: string; from: number; to: number }>;
  totalBefore: number;
  totalAfter: number;
}

export function planOrder(doc: OrderDoc, products: ReadonlyMap<string, ProductPrices>): OrderPatch | null {
  if (doc.status === 'CANCELLED' || doc.editedBy) return null;
  const changes: OrderPatch['changes'] = [];
  const repriced = doc.items.map((i) => {
    const p = products.get(String(i.productId));
    const listed = doc.distributorId ? p?.ptsPaise : p?.ptrPaise;
    if (!listed || !p || p.mrpPaise === null || i.unitPricePaise !== p.mrpPaise || listed === i.unitPricePaise) return i;
    changes.push({ productId: String(i.productId), from: i.unitPricePaise, to: listed });
    return { ...i, unitPricePaise: listed, amountPaise: i.quantity * listed };
  });
  if (changes.length === 0) return null;

  const net = netLines(repriced.map((i) => ({ grossPaise: i.amountPaise, lineDiscount: i.discount ?? null })), doc.discount);
  // A flat discount that now exceeds its line would be capped silently; leave that order for the office.
  if (repriced.some((i) => i.discount?.type === 'FIXED' && i.discount.amountPaise > i.amountPaise)) return null;
  const items = repriced.map((i, k) => {
    const netAmountPaise = net.lines[k]!.netPaise;
    return { ...i, netAmountPaise, ...(i.suppliedQty != null && { suppliedNetPaise: suppliedNet(netAmountPaise, i.quantity, i.suppliedQty) }) };
  });
  const set: Record<string, unknown> = { items, totalAmountPaise: net.netTotalPaise, orderDiscountPaise: net.orderDiscountPaise };
  if (doc.status === 'DONE') set['suppliedAmountPaise'] = items.reduce((n, i) => n + (i.suppliedNetPaise ?? suppliedNet(i.netAmountPaise, i.quantity, i.quantity)), 0);
  if (!doc.originalItems?.length) {
    set['originalItems'] = doc.items;
    set['originalTotalAmountPaise'] = doc.totalAmountPaise;
  }
  return { set, changes, totalBefore: doc.totalAmountPaise, totalAfter: net.netTotalPaise };
}
