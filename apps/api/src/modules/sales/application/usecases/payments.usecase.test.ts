import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { Order } from '../../domain/order.entity.js';
import type { OrderRepositoryPort } from '../../domain/order.repository.port.js';
import type { DistributorPayment } from '../../domain/payment.entity.js';
import type { PaymentRepositoryPort } from '../../domain/payment.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import { SalesClock } from '../salesClock.js';
import { CancelPaymentUseCase, ListPaymentsUseCase, RecordPaymentUseCase, type RecordPaymentInput } from './payments.usecase.js';
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
  async cancel(id: string, by: string, at: Date, reason: string) {
    const p = this.rows.find((r) => r.id === id);
    if (!p || p.status !== 'RECORDED') return false;
    Object.assign(p, { status: 'CANCELLED', cancelledBy: by, cancelledAt: at, cancelReason: reason });
    return true;
  }
}

const distributorOrders: Order[] = [];
const orders = {
  async list(f: { outlet?: { id: string }; from?: string; to?: string }) {
    return distributorOrders.filter((o) => o.outlet.id === f.outlet?.id && (!f.from || o.orderDate >= f.from) && (!f.to || o.orderDate <= f.to));
  },
} as unknown as OrderRepositoryPort;
const order = (id: string, orderDate: string, status: Order['status'], totalAmountPaise: number): Order =>
  ({ id, userId: 'mr1', outlet: { type: 'DISTRIBUTOR', id: 'dist1' }, orderDate, status, totalAmountPaise, remarks: null, items: [], completedBy: null, completedAt: null, clientId: null, createdAt: new Date() }) as Order;

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
    record = new RecordPaymentUseCase(master, payments, clock, config, users);
    cancel = new CancelPaymentUseCase(payments, clock, config, users);
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
});
