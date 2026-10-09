import type { DistributorPaymentDto, DistributorPaymentsDto, DistributorPaymentTotalDto } from '@greynote/contracts';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { Paise } from '@/shared/money/paise.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { OrderRepositoryPort } from '../../domain/order.repository.port.js';
import type { DistributorPayment, PaymentMode } from '../../domain/payment.entity.js';
import type { PaymentRepositoryPort } from '../../domain/payment.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../outletAccess.js';
import type { SalesClock } from '../salesClock.js';

/** The most payments or orders one read covers. A distributor collects a handful a month; a range this long is far past that. */
const LIMIT = 2000;
const UNKNOWN = '(removed)';

async function toDtos(users: UserDirectoryPort, rows: DistributorPayment[]): Promise<DistributorPaymentDto[]> {
  const people = await users.getUserSummaries([...new Set(rows.map((r) => r.recordedBy))]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  return rows.map((p) => ({
    id: p.id,
    distributorId: p.distributorId,
    paymentDate: p.paymentDate,
    amountPaise: p.amountPaise,
    mode: p.mode,
    reference: p.reference,
    note: p.note,
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
}

/** Admin or the Accountant (the route says which) records money received from an active distributor, on a day not in the future, in an open financial year. */
export class RecordPaymentUseCase {
  constructor(
    private readonly master: FieldMasterDataPort,
    private readonly payments: PaymentRepositoryPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, input: RecordPaymentInput): Promise<DistributorPaymentDto> {
    const distributor = await this.master.getDistributor(input.distributorId);
    if (!distributor || distributor.status !== 'active') throw new StockRefusal(STOCK_CODES.outletNotFound, 'That distributor does not exist or is no longer active.');
    if (input.paymentDate > (await this.clock.today())) throw new StockRefusal(STOCK_CODES.paymentDateInFuture, 'A payment cannot be dated in the future.');
    await assertFinancialYearOpen(this.config, input.paymentDate, 'This payment');
    const created = await this.payments.create({ ...input, status: 'RECORDED', recordedBy: actor.id, createdAt: this.clock.now(), cancelledBy: null, cancelledAt: null, cancelReason: null });
    return (await toDtos(this.users, [created]))[0]!;
  }
}

/** A wrong entry is cancelled with a reason, once; it stays listed and is left out of the totals. */
export class CancelPaymentUseCase {
  constructor(
    private readonly payments: PaymentRepositoryPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, id: string, reason: string): Promise<DistributorPaymentDto> {
    const payment = await this.payments.findById(id);
    if (!payment) throw new StockRefusal(STOCK_CODES.paymentNotFound, 'No such payment.');
    await assertFinancialYearOpen(this.config, payment.paymentDate, 'This payment');
    if (!(await this.payments.cancel(id, actor.id, this.clock.now(), reason))) throw new StockRefusal(STOCK_CODES.paymentNotRecorded, 'The payment is already cancelled.');
    return (await toDtos(this.users, [(await this.payments.findById(id)) ?? payment]))[0]!;
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
    if (!(await this.master.getDistributor(filter.distributorId))) throw new StockRefusal(STOCK_CODES.outletNotFound, 'No such distributor.');
    const [rows, orders] = await Promise.all([this.payments.list(filter, LIMIT), this.orders.list({ outlet: { type: 'DISTRIBUTOR', id: filter.distributorId }, from: filter.from, to: filter.to }, LIMIT)]);
    const payments = await toDtos(this.users, rows);
    return {
      from: filter.from,
      to: filter.to,
      payments,
      collectedPaise: rows.filter((p) => p.status === 'RECORDED').reduce((n, p) => n + p.amountPaise, 0),
      orderedPaise: orders.filter((o) => o.status !== 'CANCELLED').reduce((n, o) => n + o.totalAmountPaise, 0),
    };
  }
}

/** What every distributor paid in a range, for the Distributors list's "collected" column — one query however many distributors. */
export class PaymentTotalsUseCase {
  constructor(private readonly payments: PaymentRepositoryPort) {}

  async execute(range: { from: string; to: string }): Promise<DistributorPaymentTotalDto[]> {
    return this.payments.totals(range);
  }
}
