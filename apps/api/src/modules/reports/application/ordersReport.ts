import type { OrdersReportDto, ReportOrderDetailDto, ReportOrderRowDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { monthRange } from '@/shared/time/businessTime.js';
import type { IdentityPort, MasterPort, OrderRecord, SalesPort } from '../domain/ports.js';

/** The most orders one month's list returns; a caller that gets this many knows there may be more. */
export const ORDERS_LIMIT = 2000;

const UNKNOWN = '(removed)';

/** The Admin's view of orders: a month of them with names, totals by status, and any one in full. Reads only. */
export class OrdersReport {
  constructor(
    private readonly sales: SalesPort,
    private readonly master: MasterPort,
    private readonly identity: IdentityPort,
  ) {}

  async month(input: { month: string; type?: 'DISTRIBUTOR' | 'CHEMIST' | undefined; status?: 'PLACED' | 'DONE' | 'CANCELLED' | undefined; mrId?: string | undefined }): Promise<OrdersReportDto> {
    const { from, to } = monthRange(input.month);
    const fetched = await this.sales.listOrders({ from, to, ...(input.status && { status: input.status }), ...(input.mrId && { userId: input.mrId }), limit: ORDERS_LIMIT });
    const orders = input.type ? fetched.filter((o) => o.outlet.type === input.type) : fetched;
    const rows = await this.rows(orders);
    const totals = {
      done: { count: 0, amountPaise: 0 },
      placed: { count: 0, amountPaise: 0 },
      cancelled: { count: 0, amountPaise: 0 },
    };
    for (const r of rows) {
      const bucket = r.status === 'DONE' ? totals.done : r.status === 'PLACED' ? totals.placed : totals.cancelled;
      bucket.count += 1;
      bucket.amountPaise += r.status === 'DONE' ? (r.suppliedAmountPaise ?? r.totalAmountPaise) : r.totalAmountPaise;
    }
    return { month: input.month, rows, totals, truncated: fetched.length >= ORDERS_LIMIT };
  }

  async detail(orderId: string): Promise<ReportOrderDetailDto> {
    const order = await this.sales.getOrder(orderId);
    if (!order) throw AppError.notFound();
    const [row] = await this.rows([order]);
    const names = await this.master.listNames({ productIds: [...order.items, ...(order.originalItems ?? [])].map((i) => i.productId) });
    const product = new Map(names.products.map((p) => [p.id, p]));
    const [by] = order.completedBy ? await this.identity.getUserSummaries([order.completedBy]) : [];
    return {
      ...row!,
      items: order.items.map((i) => ({ productId: i.productId, productName: product.get(i.productId)?.name ?? UNKNOWN, sku: product.get(i.productId)?.sku ?? '', quantity: i.quantity, unitPricePaise: i.unitPricePaise, amountPaise: i.amountPaise, suppliedQty: order.status === 'DONE' ? (i.suppliedQty ?? i.quantity) : null, freeQty: i.freeQty ?? 0 })),
      original: order.originalItems ? order.originalItems.map((i) => ({ productId: i.productId, productName: product.get(i.productId)?.name ?? UNKNOWN, quantity: i.quantity, unitPricePaise: i.unitPricePaise })) : null,
      originalTotalAmountPaise: order.originalTotalAmountPaise ?? null,
      completedBy: by ? { id: by.id, name: by.name } : null,
    };
  }

  /** Orders with the MR's and the outlet's name, in three lookups however many rows. */
  private async rows(orders: OrderRecord[]): Promise<ReportOrderRowDto[]> {
    if (orders.length === 0) return [];
    const [people, names] = await Promise.all([
      this.identity.getUserSummaries([...new Set(orders.map((o) => o.userId))]),
      this.master.listNames({
        distributorIds: orders.filter((o) => o.outlet.type === 'DISTRIBUTOR').map((o) => o.outlet.id),
        chemistIds: orders.filter((o) => o.outlet.type === 'CHEMIST').map((o) => o.outlet.id),
      }),
    ]);
    const mr = new Map(people.map((p) => [p.id, p]));
    const outlets = { DISTRIBUTOR: new Map(names.distributors.map((d) => [d.id, d.name])), CHEMIST: new Map(names.chemists.map((c) => [c.id, c.name])) };
    return orders.map((o) => ({
      id: o.id,
      orderDate: o.orderDate,
      status: o.status,
      outletType: o.outlet.type,
      outlet: { id: o.outlet.id, name: outlets[o.outlet.type].get(o.outlet.id) ?? UNKNOWN },
      mr: { id: o.userId, name: mr.get(o.userId)?.name ?? UNKNOWN, employeeCode: mr.get(o.userId)?.employeeCode ?? '' },
      itemCount: o.items.length,
      totalAmountPaise: o.totalAmountPaise,
      suppliedAmountPaise: o.status === 'DONE' ? (o.suppliedAmountPaise ?? o.totalAmountPaise) : null,
      completedAt: o.completedAt ? o.completedAt.toISOString() : null,
      remarks: o.remarks,
    }));
  }
}
