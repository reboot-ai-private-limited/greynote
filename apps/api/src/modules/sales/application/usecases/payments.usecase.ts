import type { DistributorBalanceDto, DistributorOutstandingDto,DistributorPaymentDto, DistributorPaymentsDto, DistributorPaymentTotalDto } from '@greynote/contracts';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { Paise } from '@/shared/money/paise.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { OrderRepositoryPort } from '../../domain/order.repository.port.js';
import { owedOf } from '../../domain/orderInvoice.js';
import type { DistributorPayment, PaymentAllocation, PaymentMode } from '../../domain/payment.entity.js';
import type { PaymentRepositoryPort } from '../../domain/payment.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../outletAccess.js';
import type { SalesClock } from '../salesClock.js';

/** The most payments or orders one read covers. A distributor collects a handful a month; a range this long is far past that. */
const LIMIT = 2000;
const UNKNOWN = '(removed)';

async function toDtos(users: UserDirectoryPort, orders: OrderRepositoryPort, rows: DistributorPayment[]): Promise<DistributorPaymentDto[]> {
  const people = await users.getUserSummaries([...new Set(rows.map((r) => r.recordedBy))]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const numbers = new Map<string, string | null>();
  for (const id of new Set(rows.flatMap((r) => r.allocations.map((a) => a.orderId)))) numbers.set(id, (await orders.findById(id))?.invoiceNumber ?? null);
  return rows.map((p) => ({
    id: p.id,
    distributorId: p.distributorId,
    paymentDate: p.paymentDate,
    amountPaise: p.amountPaise,
    mode: p.mode,
    reference: p.reference,
    note: p.note,
    allocations: p.allocations.map((a) => ({ orderId: a.orderId, invoiceNumber: numbers.get(a.orderId) ?? null, amountPaise: a.amountPaise })),
    status: p.status,
    recordedBy: { id: p.recordedBy, name: names.get(p.recordedBy) ?? UNKNOWN },
    createdAt: p.createdAt.toISOString(),
    cancelledAt: p.cancelledAt ? p.cancelledAt.toISOString() : null,
    cancelReason: p.cancelReason,
  }));
}

export interface RecordPaymentInput {
  distributorId: string;
  /** `YYYY-MM-DD`, not in the future. */
  paymentDate: string;
  amountPaise: Paise;
  mode: PaymentMode;
  reference: string | null;
  note: string | null;
  allocations?: PaymentAllocation[] | undefined;
}

/**
 * Admin or the Accountant (the route says which) records money received from an active distributor, on a day not in the future, in an open financial year.
 * It may be allocated across invoices (Done orders of that distributor that have a number): each amount at most what is still due on that invoice, all together at most the payment; the rest is on account.
 */
export class RecordPaymentUseCase {
  constructor(
    private readonly master: FieldMasterDataPort,
    private readonly payments: PaymentRepositoryPort,
    private readonly orders: OrderRepositoryPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, input: RecordPaymentInput): Promise<DistributorPaymentDto> {
    const distributor = await this.master.getDistributor(input.distributorId);
    if (!distributor || distributor.status !== 'active') throw new StockRefusal(STOCK_CODES.outletNotFound, 'That distributor does not exist or is no longer active.');
    if (input.paymentDate > (await this.clock.today())) throw new StockRefusal(STOCK_CODES.paymentDateInFuture, 'A payment cannot be dated in the future.');
    await assertFinancialYearOpen(this.config, input.paymentDate, 'This payment');
    const allocations = input.allocations ?? [];
    await this.checkAllocations(input.distributorId, input.amountPaise, allocations);
    const created = await this.payments.create({ ...input, allocations, status: 'RECORDED', recordedBy: actor.id, createdAt: this.clock.now(), cancelledBy: null, cancelledAt: null, cancelReason: null });
    return (await toDtos(this.users, this.orders, [created]))[0]!;
  }

  private async checkAllocations(distributorId: string, amountPaise: Paise, allocations: readonly PaymentAllocation[]): Promise<void> {
    if (allocations.length === 0) return;
    if (new Set(allocations.map((a) => a.orderId)).size !== allocations.length) throw new StockRefusal(STOCK_CODES.allocationInvalid, 'An invoice appears twice.');
    if (allocations.some((a) => !Number.isInteger(a.amountPaise) || a.amountPaise <= 0)) throw new StockRefusal(STOCK_CODES.allocationInvalid, 'Each invoice amount must be more than zero.');
    if (allocations.reduce((n, a) => n + a.amountPaise, 0) > amountPaise) throw new StockRefusal(STOCK_CODES.allocationInvalid, 'The invoice amounts add up to more than the payment.');
    const paid = await this.payments.allocatedToOrders(allocations.map((a) => a.orderId));
    for (const a of allocations) {
      const order = await this.orders.findById(a.orderId);
      if (!order || order.status !== 'DONE' || order.outlet.type !== 'DISTRIBUTOR' || order.outlet.id !== distributorId || !order.invoiceNumber) {
        throw new StockRefusal(STOCK_CODES.allocationInvalid, 'An invoice in the list is not an invoice of this distributor.');
      }
      const due = owedOf(order) - (paid.get(a.orderId) ?? 0);
      if (a.amountPaise > due) throw new StockRefusal(STOCK_CODES.allocationInvalid, `Invoice ${order.invoiceNumber} has only ${(due / 100).toFixed(2)} due.`);
    }
  }
}

/** A wrong entry is cancelled with a reason, once; it stays listed and is left out of the totals. */
export class CancelPaymentUseCase {
  constructor(
    private readonly payments: PaymentRepositoryPort,
    private readonly orders: OrderRepositoryPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, id: string, reason: string): Promise<DistributorPaymentDto> {
    const payment = await this.payments.findById(id);
    if (!payment) throw new StockRefusal(STOCK_CODES.paymentNotFound, 'No such payment.');
    await assertFinancialYearOpen(this.config, payment.paymentDate, 'This payment');
    if (!(await this.payments.cancel(id, actor.id, this.clock.now(), reason))) throw new StockRefusal(STOCK_CODES.paymentNotRecorded, 'The payment is already cancelled.');
    return (await toDtos(this.users, this.orders, [(await this.payments.findById(id)) ?? payment]))[0]!;
  }
}

/** One distributor's collections in a range with the day-by-day list, and what it ordered in the same range, for the Payments tab. */
export class ListPaymentsUseCase {
  constructor(
    private readonly payments: PaymentRepositoryPort,
    private readonly orders: OrderRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly master: FieldMasterDataPort,
  ) {}

  async execute(filter: { distributorId: string; from: string; to: string }): Promise<DistributorPaymentsDto> {
    const distributor = await this.master.getDistributor(filter.distributorId);
    if (!distributor) throw new StockRefusal(STOCK_CODES.outletNotFound, 'No such distributor.');
    const [rows, orders, delivered, collected] = await Promise.all([
      this.payments.list(filter, LIMIT),
      this.orders.list({ outlet: { type: 'DISTRIBUTOR', id: filter.distributorId }, from: filter.from, to: filter.to }, LIMIT),
      this.orders.sumDoneByDistributor([filter.distributorId]),
      this.payments.collectedAllTime(),
    ]);
    const opening = distributor.openingDuesPaise ?? 0;
    const deliveredPaise = delivered.get(filter.distributorId) ?? 0;
    const collectedPaise = collected.get(filter.distributorId) ?? 0;
    const payments = await toDtos(this.users, this.orders, rows);
    return {
      from: filter.from,
      to: filter.to,
      payments,
      collectedPaise: rows.filter((p) => p.status === 'RECORDED').reduce((n, p) => n + p.amountPaise, 0),
      orderedPaise: orders.filter((o) => o.status !== 'CANCELLED').reduce((n, o) => n + (o.status === 'DONE' ? owedOf(o) : o.totalAmountPaise), 0),
      dues: { openingPaise: opening, deliveredPaise, collectedPaise, duesPaise: opening + deliveredPaise - collectedPaise },
    };
  }
}

/** What every distributor was delivered and paid, all time, for the Distributors list's "Dues" column (the list adds each one's opening dues): one pair of queries however many distributors. */
export class DistributorBalancesUseCase {
  constructor(
    private readonly payments: PaymentRepositoryPort,
    private readonly orders: OrderRepositoryPort,
  ) {}

  async execute(): Promise<DistributorBalanceDto[]> {
    const [delivered, collected] = await Promise.all([this.orders.sumDoneByDistributor(), this.payments.collectedAllTime()]);
    return [...new Set([...delivered.keys(), ...collected.keys()])].map((distributorId) => ({ distributorId, deliveredPaise: delivered.get(distributorId) ?? 0, collectedPaise: collected.get(distributorId) ?? 0 }));
  }
}

/** What every distributor owes in all, for the Distributors list's headline: opening dues + delivered − collected, across all of them, all time. */
export class OutstandingDuesUseCase {
  constructor(
    private readonly master: FieldMasterDataPort,
    private readonly payments: PaymentRepositoryPort,
    private readonly orders: OrderRepositoryPort,
  ) {}

  async execute(): Promise<DistributorOutstandingDto> {
    const [opening, delivered, collected] = await Promise.all([this.master.sumOpeningDues(), this.orders.sumDoneByDistributor(), this.payments.collectedAllTime()]);
    const sum = (m: Map<string, number>) => [...m.values()].reduce((n, v) => n + v, 0);
    return { duesPaise: opening + sum(delivered) - sum(collected) };
  }
}

/** What every distributor paid in a range, for the Distributors list's "collected" column — one query however many distributors. */
export class PaymentTotalsUseCase {
  constructor(private readonly payments: PaymentRepositoryPort) {}

  async execute(range: { from: string; to: string }): Promise<DistributorPaymentTotalDto[]> {
    return this.payments.totals(range);
  }
}
