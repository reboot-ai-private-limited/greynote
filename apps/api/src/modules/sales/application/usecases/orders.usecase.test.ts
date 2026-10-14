import { beforeEach, describe, expect, it } from 'vitest';
import type { Order } from '../../domain/order.entity.js';
import type { OrderFilter, OrderRepositoryPort } from '../../domain/order.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import { OutletAccess } from '../outletAccess.js';
import { SalesClock } from '../salesClock.js';
import { EditOrderUseCase, FinishOrderUseCase, GetOrderUseCase, ListOrdersUseCase, PlaceOrderUseCase, type PlaceOrderInput } from './orders.usecase.js';
import { FakeMaster, FakeUsers, config } from './salesTestKit.js';

class FakeOrders implements OrderRepositoryPort {
  rows: Order[] = [];
  async sumDistributorOrders() {
    return [];
  }
  async sumUserOrders() {
    return [];
  }
  async sumAmount(f: { userIds: string[]; from: string; to: string; productId?: string | undefined }) {
    return this.rows
      .filter((o) => f.userIds.includes(o.userId) && o.status !== 'CANCELLED' && o.orderDate >= f.from && o.orderDate <= f.to)
      .reduce((n, o) => n + (f.productId ? o.items.filter((i) => i.productId === f.productId).reduce((m, i) => m + i.amountPaise, 0) : o.totalAmountPaise), 0);
  }
  async create(input: Omit<Order, 'id'>) {
    const o = { ...input, id: `o${this.rows.length + 1}` };
    this.rows.push(o);
    return o;
  }
  async findById(id: string) {
    return this.rows.find((o) => o.id === id) ?? null;
  }
  async list(f: OrderFilter) {
    return this.rows.filter((o) => (!f.userIds || f.userIds.includes(o.userId)) && (!f.status || o.status === f.status) && (!f.outlet || (o.outlet.type === f.outlet.type && o.outlet.id === f.outlet.id)));
  }
  async update(id: string, change: { items: Order['items']; totalAmountPaise: number; remarks: string | null }, by: string, at: Date) {
    const o = this.rows.find((r) => r.id === id);
    if (!o || o.status !== 'PLACED') return false;
    Object.assign(o, { ...change, editedBy: by, editedAt: at });
    return true;
  }
  async transition(id: string, to: 'DONE' | 'CANCELLED', by: string, at: Date) {
    const o = this.rows.find((r) => r.id === id);
    if (!o || o.status !== 'PLACED') return false;
    Object.assign(o, { status: to, completedBy: by, completedAt: at });
    return true;
  }
}

const mr1 = { id: 'mr1', role: 'FIELD' };
const mr2 = { id: 'mr2', role: 'FIELD' };
const asm = { id: 'asm', role: 'FIELD' };
const admin = { id: 'admin', role: 'ADMIN' };
const acct = { id: 'acct', role: 'ACCOUNTANT' };
const order = (over: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({ outlet: { type: 'DISTRIBUTOR', id: 'dist1' }, remarks: null, lines: [{ productId: 'prod1', quantity: 3, unitPricePaise: 12_50 }, { productId: 'prod2', quantity: 10, unitPricePaise: 99 }], ...over });

describe('orders', () => {
  let orders: FakeOrders;
  let place: PlaceOrderUseCase;
  let get: GetOrderUseCase;
  let finish: FinishOrderUseCase;
  let list: ListOrdersUseCase;
  let edit: EditOrderUseCase;
  const now = new Date('2026-09-30T10:00:00+05:30');

  beforeEach(() => {
    orders = new FakeOrders();
    const master = new FakeMaster();
    const users = new FakeUsers();
    const clock = new SalesClock(config, () => now);
    place = new PlaceOrderUseCase(new OutletAccess(master), master, orders, clock, users);
    edit = new EditOrderUseCase(new GetOrderUseCase(orders, users), master, orders, clock);
    get = new GetOrderUseCase(orders, users);
    finish = new FinishOrderUseCase(get, orders, clock);
    list = new ListOrdersUseCase(orders, users);
  });

  const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof StockRefusal ? e.code : 'OTHER'));

  it('places an order PLACED, with each line and the total worked out by the server', async () => {
    const r = await place.execute(mr1, order());
    expect(r.totalAmountPaise).toBe(3 * 1250 + 10 * 99);
    const saved = orders.rows[0]!;
    expect(saved).toMatchObject({ status: 'PLACED', orderDate: '2026-09-30', userId: 'mr1', completedBy: null });
    expect(saved.items.map((i) => i.amountPaise)).toEqual([3750, 990]);
  });

  it('works for a Distributor, and records the phone’s client id', async () => {
    await place.execute(mr1, order({ outlet: { type: 'DISTRIBUTOR', id: 'dist1' } }), 'client-1');
    expect(orders.rows[0]).toMatchObject({ outlet: { type: 'DISTRIBUTOR', id: 'dist1' }, clientId: 'client-1' });
  });

  it('accepts a past date, refuses a future one', async () => {
    await place.execute(mr1, order({ orderDate: '2026-09-01' }));
    expect(await code(place.execute(mr1, order({ orderDate: '2026-10-01' })))).toBe(STOCK_CODES.orderDateInFuture);
  });

  it('refuses an order dated inside a closed financial year, writing nothing', async () => {
    const master = new FakeMaster();
    const closed = new PlaceOrderUseCase(new OutletAccess(master), master, orders, new SalesClock({ get: async (k: string) => (k === 'FY_CLOSED_YEARS' ? '2025' : config.get(k)) }, () => now), new FakeUsers());
    await expect(closed.execute(mr1, order({ orderDate: '2025-08-01' }))).rejects.toMatchObject({ statusCode: 409, publicDetails: { code: 'FY_CLOSED' } });
    expect(orders.rows).toEqual([]);
  });

  it('refuses another MR’s outlet, an unknown or inactive product, and a runaway amount — writing nothing', async () => {
    expect(await code(place.execute(mr1, order({ outlet: { type: 'CHEMIST', id: 'chem2' } })))).toBe(STOCK_CODES.outletNotYours);
    expect(await code(place.execute(mr1, order({ lines: [{ productId: 'bad', quantity: 1, unitPricePaise: 1 }] })))).toBe(STOCK_CODES.productNotFound);
    expect(await code(place.execute(mr1, order({ lines: [{ productId: 'prod1', quantity: 1_000_000, unitPricePaise: 10_000_000_000 }] })))).toBe(STOCK_CODES.amountTooLarge);
    expect(orders.rows).toEqual([]);
  });

  it('completes once; completing or cancelling it again is a 409 naming the state', async () => {
    await place.execute(mr1, order());
    const done = await finish.execute(mr1, 'o1', 'DONE');
    expect(done).toMatchObject({ status: 'DONE', completedBy: 'mr1' });
    expect(await code(finish.execute(mr1, 'o1', 'DONE'))).toBe(STOCK_CODES.orderNotPlaced);
    expect(await code(finish.execute(mr1, 'o1', 'CANCELLED'))).toBe(STOCK_CODES.orderNotPlaced);
    expect(orders.rows[0]!.status).toBe('DONE');
  });

  it('a chemist order is information only: it can be placed but never marked done or cancelled', async () => {
    await place.execute(mr1, order({ outlet: { type: 'CHEMIST', id: 'chem1' } }));
    expect(await code(finish.execute(mr1, 'o1', 'DONE'))).toBe(STOCK_CODES.orderInfoOnly);
    expect(await code(finish.execute(admin, 'o1', 'CANCELLED'))).toBe(STOCK_CODES.orderInfoOnly);
    expect(orders.rows[0]!.status).toBe('PLACED');
  });

  it('cancels a PLACED order, and a cancelled one cannot then be completed', async () => {
    await place.execute(mr1, order());
    expect((await finish.execute(mr1, 'o1', 'CANCELLED')).status).toBe('CANCELLED');
    expect(await code(finish.execute(mr1, 'o1', 'DONE'))).toBe(STOCK_CODES.orderNotPlaced);
  });

  it('only the MR who placed it, or Admin, may finish it; others cannot even see it', async () => {
    await place.execute(mr1, order());
    expect(await code(finish.execute(asm, 'o1', 'DONE'))).toBe(STOCK_CODES.orderNotYours); // manager sees it, may not act
    expect(await code(finish.execute(mr2, 'o1', 'DONE'))).toBe(STOCK_CODES.orderNotFound); // a peer does not see it at all
    expect((await finish.execute(admin, 'o1', 'DONE')).status).toBe('DONE');
  });

  it('the Accountant sees every order and may mark it done or cancel it, like Admin', async () => {
    await place.execute(mr1, order());
    await place.execute(mr1, order());
    const accountant = { ...admin, id: 'acc1', role: 'ACCOUNTANT' as const };
    expect((await list.execute(accountant, {})).length).toBe(2);
    expect(await finish.execute(accountant, 'o1', 'DONE')).toMatchObject({ status: 'DONE', completedBy: 'acc1' });
    expect((await finish.execute(accountant, 'o2', 'CANCELLED')).status).toBe('CANCELLED');
  });

  it('lists: own for an MR, the team’s for a manager, all for Admin', async () => {
    await place.execute(mr1, order());
    await place.execute(mr2, order({ outlet: { type: 'CHEMIST', id: 'chem2' } }));
    expect((await list.execute(mr1, {})).length).toBe(1);
    expect((await list.execute(mr2, {})).length).toBe(1);
    expect((await list.execute(asm, {})).length).toBe(2);
    expect((await list.execute(admin, { status: 'DONE' })).length).toBe(0);
    expect((await list.execute(admin, {})).length).toBe(2);
  });

  it('sums what users ordered in a range, leaving cancelled orders out, whole or by product', async () => {
    await place.execute(mr1, order()); // 3750 + 990 = 4740, dated 2026-09-30
    await place.execute(mr1, order({ orderDate: '2026-09-10', lines: [{ productId: 'prod1', quantity: 1, unitPricePaise: 1000 }] }));
    await place.execute(mr2, order({ outlet: { type: 'CHEMIST', id: 'chem2' }, orderDate: '2026-08-31' }));
    await place.execute(mr1, order({ orderDate: '2026-09-11', lines: [{ productId: 'prod1', quantity: 5, unitPricePaise: 1000 }] }));
    await finish.execute(mr1, 'o4', 'CANCELLED');
    await finish.execute(mr1, 'o1', 'DONE'); // DONE still counts
    const sep = { from: '2026-09-01', to: '2026-09-30' };
    expect(await orders.sumAmount({ userIds: ['mr1'], ...sep })).toBe(4740 + 1000);
    expect(await orders.sumAmount({ userIds: ['mr1', 'mr2'], ...sep })).toBe(4740 + 1000);
    expect(await orders.sumAmount({ userIds: ['mr1', 'mr2'], from: '2026-08-01', to: '2026-09-30' })).toBe(4740 + 1000 + 4740);
    expect(await orders.sumAmount({ userIds: ['mr1'], ...sep, productId: 'prod1' })).toBe(3750 + 1000);
    expect(await orders.sumAmount({ userIds: [], ...sep })).toBe(0);
  });

  it('an unknown order is NOT_FOUND', async () => {
    expect(await code(get.execute(admin, 'nope'))).toBe(STOCK_CODES.orderNotFound);
  });

  it('Admin or the Accountant adds an order for a field employee, credited to them, on any active outlet', async () => {
    const r = await place.executeFor(acct, 'mr2', order());
    const saved = await orders.findById(r.serverId);
    expect(saved).toMatchObject({ userId: 'mr2', createdBy: 'acct', status: 'PLACED' });
    expect(await code(place.executeFor(acct, 'admin', order()))).toBe(STOCK_CODES.employeeNotFound);
    expect(await code(place.executeFor(acct, 'mr1', order({ outlet: { type: 'DISTRIBUTOR', id: 'nope' } })))).toBe(STOCK_CODES.outletNotFound);
  });

  it('Admin or the Accountant edits a PLACED order, then marks it done; the lines are repriced by the server', async () => {
    const { serverId } = await place.execute(mr1, order());
    const o = await edit.execute(acct, serverId, { remarks: 'fixed', lines: [{ productId: 'prod1', quantity: 2, unitPricePaise: 1000 }] });
    expect(o).toMatchObject({ totalAmountPaise: 2000, remarks: 'fixed', editedBy: 'acct', userId: 'mr1' });
    expect((await finish.execute(acct, serverId, 'DONE')).status).toBe('DONE');
    expect(await code(edit.execute(acct, serverId, { remarks: null, lines: [{ productId: 'prod1', quantity: 1, unitPricePaise: 1 }] }))).toBe(STOCK_CODES.orderNotPlaced);
  });

  it('a field employee cannot edit an order, and an unknown product is refused', async () => {
    const { serverId } = await place.execute(mr1, order());
    expect(await code(edit.execute(mr1, serverId, { remarks: null, lines: [{ productId: 'prod1', quantity: 1, unitPricePaise: 1 }] }))).toBe(STOCK_CODES.orderNotYours);
    expect(await code(edit.execute(admin, serverId, { remarks: null, lines: [{ productId: 'zzz', quantity: 1, unitPricePaise: 1 }] }))).toBe(STOCK_CODES.productNotFound);
    expect((await orders.findById(serverId))?.totalAmountPaise).toBe(4740);
  });
});
