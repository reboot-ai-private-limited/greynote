import type { InvoiceDetailDto, InvoiceRowDto, InvoiceStatus } from '@greynote/contracts';
import { businessDate } from '@/shared/time/businessTime.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import { deliveredOf, type Order } from '../../domain/order.entity.js';
import type { OrderRepositoryPort } from '../../domain/order.repository.port.js';
import type { PaymentRepositoryPort } from '../../domain/payment.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { SalesClock } from '../salesClock.js';

/** The most invoices one read covers. */
const LIMIT = 2000;
const UNKNOWN = '(removed)';

const statusOf = (total: number, paid: number): InvoiceStatus => (paid <= 0 ? 'UNPAID' : paid >= total ? 'PAID' : 'PARTIAL');

/** A Done distributor order with an invoice number and a frozen invoice: the only orders that are invoices. */
const isInvoice = (o: Order): o is Order & { invoiceNumber: string; invoice: NonNullable<Order['invoice']> } => o.status === 'DONE' && o.outlet.type === 'DISTRIBUTOR' && !!o.invoiceNumber && !!o.invoice;

export interface InvoiceFilter {
  distributorId?: string | undefined;
  status?: InvoiceStatus | undefined;
  /** Bounds on the day the order was placed, both inclusive. */
  from?: string | undefined;
  to?: string | undefined;
}

/** Invoices for the Invoices page and the payment dialog: each Done order with a number, with what has been paid to it. Admin and the Accountant (the route says which). */
export class ListInvoicesUseCase {
  constructor(
    private readonly orders: OrderRepositoryPort,
    private readonly payments: PaymentRepositoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly clock: SalesClock,
  ) {}

  async execute(filter: InvoiceFilter): Promise<InvoiceRowDto[]> {
    const orders = (
      await this.orders.list({ status: 'DONE', from: filter.from, to: filter.to, outlet: filter.distributorId ? { type: 'DISTRIBUTOR', id: filter.distributorId } : undefined }, LIMIT)
    ).filter(isInvoice);
    const paid = await this.payments.allocatedToOrders(orders.map((o) => o.id));
    const names = new Map<string, string>();
    for (const id of new Set(orders.map((o) => o.outlet.id))) names.set(id, (await this.master.getDistributor(id))?.name ?? UNKNOWN);
    const [timeZone, dayStart] = await Promise.all([this.clock.timeZone(), this.clock.dayStart()]);
    return orders
      .map((o): InvoiceRowDto => {
        const paidPaise = paid.get(o.id) ?? 0;
        return {
          orderId: o.id,
          invoiceNumber: o.invoiceNumber,
          invoiceDate: businessDate(o.completedAt ?? o.createdAt, timeZone, dayStart),
          distributor: { id: o.outlet.id, name: names.get(o.outlet.id) ?? UNKNOWN },
          totalPaise: o.invoice.totalPaise,
          paidPaise,
          duePaise: o.invoice.totalPaise - paidPaise,
          status: statusOf(o.invoice.totalPaise, paidPaise),
        };
      })
      .filter((r) => !filter.status || r.status === filter.status)
      .sort((a, b) => (a.invoiceDate === b.invoiceDate ? 0 : a.invoiceDate < b.invoiceDate ? 1 : -1));
  }
}

/** One invoice with everything the printed Tax Invoice shows. MRP is the product's today (orders do not keep it). */
export class GetInvoiceUseCase {
  constructor(
    private readonly orders: OrderRepositoryPort,
    private readonly payments: PaymentRepositoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly clock: SalesClock,
  ) {}

  async execute(orderId: string): Promise<InvoiceDetailDto> {
    const order = /^[a-f\d]{24}$/i.test(orderId) ? await this.orders.findById(orderId) : null;
    if (!order || !isInvoice(order)) throw new StockRefusal(STOCK_CODES.orderNotFound, 'No such invoice.');
    const [distributor, paid, timeZone, dayStart] = await Promise.all([this.master.getDistributor(order.outlet.id), this.payments.allocatedToOrders([order.id]), this.clock.timeZone(), this.clock.dayStart()]);
    const paidPaise = paid.get(order.id) ?? 0;
    const lines = [];
    for (const [at, item] of order.items.entries()) {
      const d = deliveredOf(item);
      // A line that was not supplied at all is not on the invoice.
      if (d.suppliedQty === 0 && d.freeQty === 0) continue;
      const product = await this.master.getProduct(item.productId);
      const tax = order.invoice.lines[at];
      lines.push({ productName: product?.name ?? UNKNOWN, sku: product?.sku ?? '', mrpPaise: product?.mrpPaise ?? null, suppliedQty: d.suppliedQty, freeQty: d.freeQty, unitPricePaise: item.unitPricePaise, hsn: item.hsn ?? null, batchNo: item.batchNo ?? null, expiry: item.expiry ?? null, gstPercent: tax?.gstPercent ?? 0, amountPaise: d.amountPaise, gstPaise: tax?.gstPaise ?? 0 });
    }
    return {
      orderId: order.id,
      invoiceNumber: order.invoiceNumber,
      invoiceDate: businessDate(order.completedAt ?? order.createdAt, timeZone, dayStart),
      distributor: { id: order.outlet.id, name: distributor?.name ?? UNKNOWN, address: distributor?.address ?? null, gstNumber: distributor?.gstNumber ?? null, mobile: distributor?.mobile ?? null },
      lines,
      taxablePaise: order.invoice.taxablePaise,
      gstPaise: order.invoice.gstPaise,
      roundOffPaise: order.invoice.roundOffPaise,
      totalPaise: order.invoice.totalPaise,
      paidPaise,
      duePaise: order.invoice.totalPaise - paidPaise,
      status: statusOf(order.invoice.totalPaise, paidPaise),
    };
  }
}
