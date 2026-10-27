import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { Order } from '../../domain/order.entity.js';
import type { OrderRepositoryPort } from '../../domain/order.repository.port.js';
import type { DistributorPayment } from '../../domain/payment.entity.js';
import type { PaymentRepositoryPort } from '../../domain/payment.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import { SalesClock } from '../salesClock.js';
import { CancelPaymentUseCase, DistributorBalancesUseCase, ListPaymentsUseCase, OutstandingDuesUseCase, PaymentTotalsUseCase, RecordPaymentUseCase, type RecordPaymentInput } from './payments.usecase.js';
import { FakeMaster, FakeUsers } from './salesTestKit.js';

class FakePayments implements PaymentRepositoryPort {
  rows: DistributorPayment[] = [];
  async create(input: Omit<DistributorPayment, 'id'>) {
    const p = { ...input, id: `p${this.rows.length + 1}` };
    this.rows.push(p);
    return p;
  }
  async findById(id: string) {
    return this.rows.find((p) => p.id === id) ?? null;
  }
  async list(f: { distributorId: string; from: string; to: string }) {
    return this.rows.filter((p) => p.distributorId === f.distributorId && p.paymentDate >= f.from && p.paymentDate <= f.to).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }
  async totals(f: { from: string; to: string }) {
    const sums = new Map<string, number>();
    for (const p of this.rows) if (p.status === 'RECORDED' && p.paymentDate >= f.from && p.paymentDate <= f.to) sums.set(p.distributorId, (sums.get(p.distributorId) ?? 0) + p.amountPaise);
    return [...sums].map(([distributorId, collectedPaise]) => ({ distributorId, collectedPaise }));
  }
  async collectedAllTime() {
    const sums = new Map<string, number>();
    for (const p of this.rows) if (p.status === 'RECORDED') sums.set(p.distributorId, (sums.get(p.distributorId) ?? 0) + p.amountPaise);
    return sums;
  }
  async allocatedToOrders(ids: string[]) {
    const sums = new Map<string, number>();
    for (const p of this.rows) if (p.status === 'RECORDED') for (const a of p.allocations) if (ids.includes(a.orderId)) sums.set(a.orderId, (sums.get(a.orderId) ?? 0) + a.amountPaise);
    return sums;
  }
  async cancel(id: string, by: string, at: Date, reason: string) {
    const p = this.rows.find((r) => r.id === id);
    if (!p || p.status !== 'RECORDED') return false;
    Object.assign(p, { status: 'CANCELLED', cancelledBy: by, cancelledAt: at, cancelReason: reason });
    return true;
  }
}

const distributorOrders: Order[] = [];
const orders = {
  async findById(id: string) {
    return distributorOrders.find((o) => o.id === id) ?? null;
  },
  async list(f: { outlet?: { id: string }; from?: string; to?: string }) {
    return distributorOrders.filter((o) => o.outlet.id === f.outlet?.id && (!f.from || o.orderDate >= f.from) && (!f.to || o.orderDate <= f.to));
  },
  async sumDoneByDistributor(ids?: string[]) {
    const out = new Map<string, number>();
    for (const o of distributorOrders) if (o.status === 'DONE' && (!ids || ids.includes(o.outlet.id))) out.set(o.outlet.id, (out.get(o.outlet.id) ?? 0) + (o.suppliedAmountPaise ?? o.totalAmountPaise));
    return out;
  },
} as unknown as OrderRepositoryPort;
const order = (id: string, orderDate: string, status: Order['status'], totalAmountPaise: number): Order =>
  ({ id, userId: 'mr1', outlet: { type: 'DISTRIBUTOR', id: 'dist1' }, orderDate, status, totalAmountPaise, remarks: null, items: [], completedBy: null, completedAt: null, clientId: null, createdAt: new Date() }) as Order;

const invoice = (id: string, totalPaise: number, over: Partial<Order> = {}): Order => ({ ...order(id, '2026-10-01', 'DONE', totalPaise), invoiceNumber: `INV-${id}`, invoice: { taxablePaise: totalPaise, lines: [], gstPaise: 0, roundOffPaise: 0, totalPaise }, ...over });

let closed = 'NONE';
const config = { get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', FY_START_MONTH: 'APRIL', FY_CLOSED_YEARS: closed })[key] ?? '' };
const admin = { id: 'admin', role: 'ADMIN' };
const input = (over: Partial<RecordPaymentInput> = {}): RecordPaymentInput => ({ distributorId: 'dist1', paymentDate: '2026-10-05', amountPaise: 50_000_00, mode: 'BANK_TRANSFER', reference: 'UTR123', note: null, ...over });
const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof StockRefusal ? e.code : e instanceof AppError ? `${e.statusCode}` : 'OTHER'));

describe('distributor payments', () => {
  let payments: FakePayments;
  let record: RecordPaymentUseCase;
  let cancel: CancelPaymentUseCase;
  let list: ListPaymentsUseCase;

  beforeEach(() => {
    closed = 'NONE';
    payments = new FakePayments();
    distributorOrders.length = 0;
    const clock = new SalesClock(config, () => new Date('2026-10-09T06:00:00Z'));
    const users = new FakeUsers();
    const master = new FakeMaster();
    record = new RecordPaymentUseCase(master, payments, orders, clock, config, users);
    cancel = new CancelPaymentUseCase(payments, orders, clock, config, users);
    list = new ListPaymentsUseCase(payments, orders, users, master);
  });

  it('records a payment with who entered it', async () => {
    const p = await record.execute(admin, input());
    expect(p).toMatchObject({ distributorId: 'dist1', paymentDate: '2026-10-05', amountPaise: 50_000_00, mode: 'BANK_TRANSFER', reference: 'UTR123', status: 'RECORDED', recordedBy: { id: 'admin' } });
  });

  it('refuses an unknown distributor and a date in the future', async () => {
    expect(await code(record.execute(admin, input({ distributorId: 'nobody' })))).toBe(STOCK_CODES.outletNotFound);
    expect(await code(record.execute(admin, input({ paymentDate: '2026-10-10' })))).toBe(STOCK_CODES.paymentDateInFuture);
    expect(await record.execute(admin, input({ paymentDate: '2026-10-09' }))).toBeTruthy(); // today is fine
    expect(payments.rows).toHaveLength(1);
  });

  it('refuses a payment dated in a closed financial year', async () => {
    closed = '2026';
    expect(await code(record.execute(admin, input()))).toBe('409');
    expect(payments.rows).toHaveLength(0);
  });

  it('cancels once, with a reason, and keeps the record', async () => {
    const p = await record.execute(admin, input());
    const cancelled = await cancel.execute(admin, p.id, 'Wrong amount');
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'Wrong amount' });
    expect(await code(cancel.execute(admin, p.id, 'again'))).toBe(STOCK_CODES.paymentNotRecorded);
    expect(await code(cancel.execute(admin, 'nope', 'x'))).toBe(STOCK_CODES.paymentNotFound);
    expect(payments.rows).toHaveLength(1);
  });

  it('cancelling in a closed financial year is refused', async () => {
    const p = await record.execute(admin, input());
    closed = '2026';
    expect(await code(cancel.execute(admin, p.id, 'late'))).toBe('409');
  });

  it('the list totals the recorded payments and the non-cancelled orders of the range, and leaves cancelled payments out of the total', async () => {
    const a = await record.execute(admin, input({ paymentDate: '2026-10-02', amountPaise: 10_000 }));
    await record.execute(admin, input({ paymentDate: '2026-10-06', amountPaise: 25_000 }));
    await record.execute(admin, input({ paymentDate: '2026-09-20', amountPaise: 99_999 })); // before the range
    await cancel.execute(admin, a.id, 'typo');
    distributorOrders.push(order('o1', '2026-10-01', 'DONE', 70_000), order('o2', '2026-10-03', 'PLACED', 30_000), order('o3', '2026-10-04', 'CANCELLED', 99_000), order('o4', '2026-08-01', 'DONE', 1));
    const out = await list.execute({ distributorId: 'dist1', from: '2026-10-01', to: '2026-10-31' });
    expect(out.payments.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(out).toMatchObject({ collectedPaise: 25_000, orderedPaise: 100_000 });
    expect(await code(list.execute({ distributorId: 'nobody', from: '2026-10-01', to: '2026-10-31' }))).toBe(STOCK_CODES.outletNotFound);
  });

  it('the totals add up the recorded payments of each distributor in the range, leaving out cancelled ones and other dates', async () => {
    const a = await record.execute(admin, input({ paymentDate: '2026-10-02', amountPaise: 10_000 }));
    await record.execute(admin, input({ paymentDate: '2026-10-06', amountPaise: 25_000 }));
    await record.execute(admin, input({ paymentDate: '2026-09-20', amountPaise: 99_999 }));
    await cancel.execute(admin, a.id, 'typo');
    await record.execute(admin, input({ paymentDate: '2026-10-07', amountPaise: 5_000 }));
    const totals = new PaymentTotalsUseCase(payments);
    expect(await totals.execute({ from: '2026-10-01', to: '2026-10-31' })).toEqual([{ distributorId: 'dist1', collectedPaise: 30_000 }]);
    expect(await totals.execute({ from: '2026-01-01', to: '2026-01-31' })).toEqual([]);
  });

  it('dues = opening + delivered (Done, free units not charged) − recorded payments, over all time, whatever the range', async () => {
    const master = new FakeMaster();
    master.openingDues['dist1'] = 20_000;
    const withOpening = new ListPaymentsUseCase(payments, orders, new FakeUsers(), master);
    const a = await record.execute(admin, input({ paymentDate: '2026-02-02', amountPaise: 10_000 }));
    await record.execute(admin, input({ paymentDate: '2026-10-06', amountPaise: 25_000 }));
    await cancel.execute(admin, a.id, 'typo');
    distributorOrders.push(
      { ...order('o1', '2026-01-01', 'DONE', 70_000), suppliedAmountPaise: 60_000 }, // part supplied: 60,000 delivered of 70,000 ordered
      order('o2', '2026-10-03', 'DONE', 5_000), // an older Done order with no supply recorded: the total
      order('o3', '2026-10-03', 'PLACED', 30_000), // not delivered yet
    );
    const out = await withOpening.execute({ distributorId: 'dist1', from: '2026-10-01', to: '2026-10-31' });
    expect(out.dues).toEqual({ openingPaise: 20_000, deliveredPaise: 65_000, collectedPaise: 25_000, duesPaise: 60_000 });
    expect(out.orderedPaise).toBe(5_000 + 30_000); // October: the Done order at what was delivered, the Placed one as ordered
    expect(await new DistributorBalancesUseCase(payments, orders).execute()).toEqual([{ distributorId: 'dist1', deliveredPaise: 65_000, collectedPaise: 25_000 }]);
    expect(await new OutstandingDuesUseCase(master, payments, orders).execute()).toEqual({ duesPaise: 60_000 });
  });

  describe('allocations to invoices', () => {
    it('splits one payment across several invoices, the rest staying on account, and names each invoice in the result', async () => {
      distributorOrders.push(invoice('o1', 30_000), invoice('o2', 20_000));
      const p = await record.execute(admin, input({ amountPaise: 60_000, allocations: [{ orderId: 'o1', amountPaise: 30_000 }, { orderId: 'o2', amountPaise: 15_000 }] }));
      expect(p.allocations).toEqual([{ orderId: 'o1', invoiceNumber: 'INV-o1', amountPaise: 30_000 }, { orderId: 'o2', invoiceNumber: 'INV-o2', amountPaise: 15_000 }]);
      expect(await payments.allocatedToOrders(['o1', 'o2'])).toEqual(new Map([['o1', 30_000], ['o2', 15_000]]));
    });

    it('a payment with no allocations is all on account', async () => {
      expect((await record.execute(admin, input())).allocations).toEqual([]);
    });

    it('refuses more than the payment, more than is due on an invoice, a repeated invoice, and an amount of zero — writing nothing', async () => {
      distributorOrders.push(invoice('o1', 30_000));
      expect(await code(record.execute(admin, input({ amountPaise: 10_000, allocations: [{ orderId: 'o1', amountPaise: 10_001 }] })))).toBe(STOCK_CODES.allocationInvalid);
      expect(await code(record.execute(admin, input({ amountPaise: 90_000, allocations: [{ orderId: 'o1', amountPaise: 30_001 }] })))).toBe(STOCK_CODES.allocationInvalid);
      expect(await code(record.execute(admin, input({ amountPaise: 90_000, allocations: [{ orderId: 'o1', amountPaise: 1 }, { orderId: 'o1', amountPaise: 1 }] })))).toBe(STOCK_CODES.allocationInvalid);
      expect(await code(record.execute(admin, input({ amountPaise: 90_000, allocations: [{ orderId: 'o1', amountPaise: 0 }] })))).toBe(STOCK_CODES.allocationInvalid);
      expect(payments.rows).toHaveLength(0);
    });

    it('refuses an order that is not a numbered, Done invoice of this distributor', async () => {
      distributorOrders.push(invoice('o2', 5_000, { invoiceNumber: null }), invoice('o3', 5_000, { status: 'PLACED' }), invoice('o4', 5_000, { outlet: { type: 'DISTRIBUTOR', id: 'dist2' } }));
      for (const id of ['o2', 'o3', 'o4', 'nope']) {
        expect(await code(record.execute(admin, input({ allocations: [{ orderId: id, amountPaise: 1_000 }] })))).toBe(STOCK_CODES.allocationInvalid);
      }
      expect(payments.rows).toHaveLength(0);
    });

    it('what is already paid counts against an invoice, and cancelling a payment frees it again', async () => {
      distributorOrders.push(invoice('o1', 30_000));
      const first = await record.execute(admin, input({ amountPaise: 20_000, allocations: [{ orderId: 'o1', amountPaise: 20_000 }] }));
      expect(await code(record.execute(admin, input({ amountPaise: 20_000, allocations: [{ orderId: 'o1', amountPaise: 10_001 }] })))).toBe(STOCK_CODES.allocationInvalid);
      await cancel.execute(admin, first.id, 'wrong invoice');
      expect((await record.execute(admin, input({ amountPaise: 30_000, allocations: [{ orderId: 'o1', amountPaise: 30_000 }] }))).status).toBe('RECORDED');
    });
  });

  it('the range total counts an invoiced order at its invoice total (supplied + GST), not the supplied amount', async () => {
    distributorOrders.push({ ...invoice('o1', 26_000), suppliedAmountPaise: 24_700 });
    const out = await list.execute({ distributorId: 'dist1', from: '2026-10-01', to: '2026-10-31' });
    expect(out.orderedPaise).toBe(26_000);
  });
});
