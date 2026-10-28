import { beforeEach, describe, expect, it } from 'vitest';
import type { Order, OrderInvoice } from '../../domain/order.entity.js';
import type { OrderFilter, OrderRepositoryPort } from '../../domain/order.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import { OutletAccess } from '../outletAccess.js';
import { SalesClock } from '../salesClock.js';
import { EditOrderUseCase, FinishOrderUseCase, GetOrderUseCase, ListOrdersUseCase, PlaceOrderUseCase, SetInvoiceNumberUseCase, type PlaceOrderInput } from './orders.usecase.js';
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
  async update(id: string, change: { items: Order['items']; totalAmountPaise: number; discount: Order['discount']; orderDiscountPaise: number; remarks: string | null; original?: { items: Order['items']; totalAmountPaise: number } }, by: string, at: Date, ifEditedAt: Date | null) {
    const o = this.rows.find((r) => r.id === id);
    if (!o || o.status !== 'PLACED' || (o.editedAt ?? null) !== ifEditedAt) return false;
    const { original, ...rest } = change;
    Object.assign(o, { ...rest, editedBy: by, editedAt: at, ...(original && { originalItems: original.items, originalTotalAmountPaise: original.totalAmountPaise }) });
    return true;
  }
  async sumDoneByDistributor(ids: string[]) {
    const out = new Map<string, number>();
    for (const o of this.rows) if (o.status === 'DONE' && o.outlet.type === 'DISTRIBUTOR' && ids.includes(o.outlet.id)) out.set(o.outlet.id, (out.get(o.outlet.id) ?? 0) + (o.suppliedAmountPaise ?? o.totalAmountPaise));
    return out;
  }
  async complete(id: string, supply: { items: Order['items']; suppliedAmountPaise: number; invoiceNumber: string; invoice: OrderInvoice; ifEditedAt: Date | null }, by: string, at: Date) {
    const o = this.rows.find((r) => r.id === id);
    if (!o || o.status !== 'PLACED' || (o.editedAt ?? null) !== supply.ifEditedAt) return false;
    if (this.rows.some((r) => r.invoiceNumber === supply.invoiceNumber)) throw new StockRefusal(STOCK_CODES.invoiceNumberTaken, 'used');
    Object.assign(o, { status: 'DONE', completedBy: by, completedAt: at, items: supply.items, suppliedAmountPaise: supply.suppliedAmountPaise, invoiceNumber: supply.invoiceNumber, invoice: supply.invoice });
    return true;
  }
  async setInvoice(id: string, invoiceNumber: string, invoice: OrderInvoice) {
    const o = this.rows.find((r) => r.id === id);
    if (!o || o.status !== 'DONE' || o.invoiceNumber) return false;
    if (this.rows.some((r) => r.invoiceNumber === invoiceNumber)) throw new StockRefusal(STOCK_CODES.invoiceNumberTaken, 'used');
    Object.assign(o, { invoiceNumber, invoice });
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
  let master: FakeMaster;
  let place: PlaceOrderUseCase;
  let get: GetOrderUseCase;
  let finish: FinishOrderUseCase;
  let setInvoice: SetInvoiceNumberUseCase;
  /**
   * Admin or the Accountant marks it Done: the invoice number is required, here made from the order id. Every line with units supplied needs a batch and expiry,
   * so this fills them in for the lines a test leaves out (a line not named is a full supply).
   */
  const markDone = (actor: { id: string; role: string }, id: string, supply?: Array<{ productId: string; line?: number; suppliedQty: number; freeQty: number }>, number = `INV-${id}`) => {
    const items = orders.rows.find((o) => o.id === id)?.items ?? [];
    const batch = { batchNo: 'B1', expiry: '2028-03' };
    const given = (supply ?? []).map((l) => ({ ...l, ...batch }));
    const covered = new Set(given.map((l) => l.line ?? items.findIndex((i) => i.productId === l.productId)));
    const rest = items.flatMap((i, at) => (covered.has(at) ? [] : [{ productId: i.productId, line: at, suppliedQty: i.quantity, freeQty: i.freeQty ?? 0, ...batch }]));
    return finish.execute(actor, id, 'DONE', [...given, ...rest], number);
  };
  let list: ListOrdersUseCase;
  let edit: EditOrderUseCase;
  const now = new Date('2026-09-30T10:00:00+05:30');

  beforeEach(() => {
    orders = new FakeOrders();
    master = new FakeMaster();
    const users = new FakeUsers();
    const clock = new SalesClock(config, () => now);
    place = new PlaceOrderUseCase(new OutletAccess(master), master, orders, clock, users);
    edit = new EditOrderUseCase(new GetOrderUseCase(orders, users), master, orders, clock);
    get = new GetOrderUseCase(orders, users);
    finish = new FinishOrderUseCase(get, master, orders, clock);
    setInvoice = new SetInvoiceNumberUseCase(get, master, orders);
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

  it('prices an MR’s own order at the catalogue PTS (distributor) or PTR (chemist), whatever the phone sent; no listed price keeps the phone’s', async () => {
    master.prices['prod1'] = { pts: 794_00, ptr: 883_00 };
    const mrp = [{ productId: 'prod1', quantity: 30, unitPricePaise: 1159_00 }, { productId: 'prod2', quantity: 2, unitPricePaise: 500 }];
    expect((await place.execute(mr1, order({ lines: mrp }))).totalAmountPaise).toBe(30 * 794_00 + 2 * 500);
    expect(orders.rows[0]!.items.map((i) => [i.unitPricePaise, i.amountPaise])).toEqual([[794_00, 23_820_00], [500, 1000]]);
    await place.execute(mr1, order({ outlet: { type: 'CHEMIST', id: 'chem1' }, lines: mrp }));
    expect(orders.rows[1]!.items[0]).toMatchObject({ unitPricePaise: 883_00, amountPaise: 30 * 883_00 });
  });

  it('the office keeps the price it types, on an order added for an employee and on an edit', async () => {
    master.prices['prod1'] = { pts: 794_00, ptr: 883_00 };
    const { serverId } = await place.executeFor(admin, 'mr1', order({ lines: [{ productId: 'prod1', quantity: 1, unitPricePaise: 1159_00 }] }));
    expect(orders.rows[0]!.items[0]!.unitPricePaise).toBe(1159_00);
    const o = await edit.execute(admin, serverId, { remarks: null, lines: [{ productId: 'prod1', quantity: 1, unitPricePaise: 900_00 }] });
    expect(o.items[0]!.unitPricePaise).toBe(900_00);
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
    const done = await markDone(acct, 'o1');
    expect(done).toMatchObject({ status: 'DONE', completedBy: 'acct', invoiceNumber: 'INV-o1' });
    expect(await code(markDone(acct, 'o1'))).toBe(STOCK_CODES.orderNotPlaced);
    expect(await code(finish.execute(acct, 'o1', 'CANCELLED'))).toBe(STOCK_CODES.orderNotPlaced);
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
    expect(await code(markDone(acct, 'o1'))).toBe(STOCK_CODES.orderNotPlaced);
  });

  it('only Admin or the Accountant may mark it done, with the invoice number; the MR who placed it may still cancel; others cannot even see it', async () => {
    await place.execute(mr1, order());
    expect(await code(markDone(mr1, 'o1'))).toBe(STOCK_CODES.orderNotYours); // not even the MR who placed it
    expect(await code(markDone(asm, 'o1'))).toBe(STOCK_CODES.orderNotYours);
    expect(await code(markDone(mr2, 'o1'))).toBe(STOCK_CODES.orderNotFound); // a peer does not see it at all
    expect(await code(finish.execute(asm, 'o1', 'CANCELLED'))).toBe(STOCK_CODES.orderNotYours); // manager sees it, may not act
    expect(await code(finish.execute(admin, 'o1', 'DONE'))).toBe(STOCK_CODES.invalidPayload); // no invoice number
    expect(await code(finish.execute(admin, 'o1', 'DONE', undefined, '  '))).toBe(STOCK_CODES.invalidPayload);
    expect((await markDone(admin, 'o1')).status).toBe('DONE');
  });

  it('an invoice number is used once', async () => {
    await place.execute(mr1, order());
    await place.execute(mr1, order());
    await markDone(acct, 'o1', undefined, ' 3452 ');
    expect((await orders.findById('o1'))?.invoiceNumber).toBe('3452');
    expect(await code(markDone(acct, 'o2', undefined, '3452'))).toBe(STOCK_CODES.invoiceNumberTaken);
    expect((await orders.findById('o2'))?.status).toBe('PLACED');
  });

  it('freezes the GST invoice on Done: ex-GST supplied lines + GST by the product rate, rounded to the rupee, the difference kept as round-off', async () => {
    master.gst['prod1'] = 5;
    const { serverId } = await place.execute(mr1, order({ lines: [{ productId: 'prod1', quantity: 24, unitPricePaise: 1_028_00 }] }));
    const done = await markDone(acct, serverId);
    // The sample Tax Invoice: 24 × 1,028.00 = 24,672.00 + 5% = 25,905.60, rounded to 25,906.00.
    expect(done.invoice).toEqual({ taxablePaise: 24_672_00, lines: [{ gstPercent: 5, gstPaise: 1_233_60 }], gstPaise: 1_233_60, roundOffPaise: 40, totalPaise: 25_906_00 });
    master.gst['prod1'] = 12; // a later rate change never moves it
    expect((await orders.findById(serverId))?.invoice?.totalPaise).toBe(25_906_00);
  });

  it('Done stores the HSN (as it was then), batch and expiry on each supplied line; a line with none supplied carries none', async () => {
    const { serverId } = await place.execute(mr1, order({ lines: [{ productId: 'prod1', quantity: 24, unitPricePaise: 1_028_00 }, { productId: 'prod2', quantity: 5, unitPricePaise: 500 }] }));
    const done = await finish.execute(acct, serverId, 'DONE', [
      { productId: 'prod1', suppliedQty: 24, freeQty: 0, batchNo: 'NHN26J284', expiry: '2028-03' },
      { productId: 'prod2', suppliedQty: 0, freeQty: 0 },
    ], 'INV-1');
    expect(done.items[0]).toMatchObject({ hsn: '21069099', batchNo: 'NHN26J284', expiry: '2028-03' });
    expect(done.items[1]).toMatchObject({ hsn: null, batchNo: null, expiry: null });
  });

  it('Done is refused while a supplied line lacks its batch or expiry, or its product has no HSN', async () => {
    const { serverId } = await place.execute(mr1, order({ lines: [{ productId: 'prod1', quantity: 2, unitPricePaise: 1000 }] }));
    const line = { productId: 'prod1', suppliedQty: 2, freeQty: 0 };
    expect(await code(finish.execute(acct, serverId, 'DONE', undefined, 'INV-1'))).toBe(STOCK_CODES.invalidPayload);
    expect(await code(finish.execute(acct, serverId, 'DONE', [{ ...line, batchNo: 'B1' }], 'INV-1'))).toBe(STOCK_CODES.invalidPayload);
    expect(await code(finish.execute(acct, serverId, 'DONE', [{ ...line, expiry: '2028-03' }], 'INV-1'))).toBe(STOCK_CODES.invalidPayload);
    master.noHsn.add('prod1');
    expect(await code(finish.execute(acct, serverId, 'DONE', [{ ...line, batchNo: 'B1', expiry: '2028-03' }], 'INV-1'))).toBe(STOCK_CODES.invalidPayload);
    expect((await orders.findById(serverId))?.status).toBe('PLACED');
  });

  it('a product with no GST rate is taxed 0%; a part supply is invoiced for what was supplied', async () => {
    const { serverId } = await place.execute(mr1, order({ lines: [{ productId: 'prod1', quantity: 10, unitPricePaise: 1000 }] }));
    const done = await markDone(acct, serverId, [{ productId: 'prod1', suppliedQty: 4, freeQty: 3 }]);
    expect(done.invoice).toMatchObject({ taxablePaise: 4_000, gstPaise: 0, roundOffPaise: 0, totalPaise: 4_000 });
  });

  it('gives a Done order from before invoices its number once, office only, and freezes its invoice', async () => {
    const { serverId } = await place.execute(mr1, order({ lines: [{ productId: 'prod1', quantity: 2, unitPricePaise: 1000 }] }));
    expect(await code(setInvoice.execute(acct, serverId, 'OLD-1'))).toBe(STOCK_CODES.orderNotPlaced); // still Placed
    Object.assign(orders.rows[0]!, { status: 'DONE', suppliedAmountPaise: 2000 }); // as marked Done before invoices existed
    expect(await code(setInvoice.execute(mr1, serverId, 'OLD-1'))).toBe(STOCK_CODES.orderNotYours);
    expect(await code(setInvoice.execute(acct, serverId, ' '))).toBe(STOCK_CODES.invalidPayload);
    expect(await setInvoice.execute(acct, serverId, 'OLD-1')).toMatchObject({ invoiceNumber: 'OLD-1', invoice: { totalPaise: 2000 } });
    expect(await code(setInvoice.execute(acct, serverId, 'OLD-2'))).toBe(STOCK_CODES.invoiceNumberSet);
  });

  it('the Accountant sees every order and may mark it done or cancel it, like Admin', async () => {
    await place.execute(mr1, order());
    await place.execute(mr1, order());
    const accountant = { ...admin, id: 'acc1', role: 'ACCOUNTANT' as const };
    expect((await list.execute(accountant, {})).length).toBe(2);
    expect(await markDone(accountant, 'o1')).toMatchObject({ status: 'DONE', completedBy: 'acc1' });
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
    await markDone(acct, 'o1'); // DONE still counts
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
    expect((await markDone(acct, serverId)).status).toBe('DONE');
    expect(await code(edit.execute(acct, serverId, { remarks: null, lines: [{ productId: 'prod1', quantity: 1, unitPricePaise: 1 }] }))).toBe(STOCK_CODES.orderNotPlaced);
  });

  it('a field employee cannot edit an order, and an unknown product is refused', async () => {
    const { serverId } = await place.execute(mr1, order());
    expect(await code(edit.execute(mr1, serverId, { remarks: null, lines: [{ productId: 'prod1', quantity: 1, unitPricePaise: 1 }] }))).toBe(STOCK_CODES.orderNotYours);
    expect(await code(edit.execute(admin, serverId, { remarks: null, lines: [{ productId: 'zzz', quantity: 1, unitPricePaise: 1 }] }))).toBe(STOCK_CODES.productNotFound);
    expect((await orders.findById(serverId))?.totalAmountPaise).toBe(4740);
  });

  it('Admin or the Accountant mark Done with a part supply and free units; the ordered lines and total stay', async () => {
    const { serverId } = await place.execute(mr1, order({ lines: [{ productId: 'prod1', quantity: 12, unitPricePaise: 1000 }, { productId: 'prod2', quantity: 5, unitPricePaise: 100 }] }));
    const done = await markDone(acct, serverId, [{ productId: 'prod1', suppliedQty: 10, freeQty: 2 }]);
    expect(done.status).toBe('DONE');
    expect(done.totalAmountPaise).toBe(12_500);
    expect(done.items[0]).toMatchObject({ quantity: 12, suppliedQty: 10, freeQty: 2 });
    expect(done.items[1]).toMatchObject({ quantity: 5, suppliedQty: 5, freeQty: 0 });
    expect(done.suppliedAmountPaise).toBe(10 * 1000 + 5 * 100);
  });

  it('the MR cannot mark it done or record a supply; a supply above the order, or for a product not on it, is refused; a plain Done is a full supply', async () => {
    const { serverId } = await place.execute(mr1, order({ lines: [{ productId: 'prod1', quantity: 4, unitPricePaise: 1000 }] }));
    expect(await code(markDone(mr1, serverId, [{ productId: 'prod1', suppliedQty: 3, freeQty: 0 }]))).toBe(STOCK_CODES.orderNotYours);
    expect(await code(markDone(acct, serverId, [{ productId: 'prod1', suppliedQty: 5, freeQty: 0 }]))).toBe(STOCK_CODES.invalidPayload);
    expect(await code(markDone(acct, serverId, [{ productId: 'prod2', suppliedQty: 1, freeQty: 0 }]))).toBe(STOCK_CODES.productNotFound);
    expect((await orders.findById(serverId))?.status).toBe('PLACED');
    const done = await markDone(acct, serverId);
    expect(done.suppliedAmountPaise).toBe(4000);
    expect(done.items[0]).toMatchObject({ suppliedQty: 4, freeQty: 0 });
  });

  it('a second Done, or a Done after the order was changed, is a 409', async () => {
    const { serverId } = await place.execute(mr1, order());
    await markDone(acct, serverId);
    expect(await code(markDone(acct, serverId))).toBe(STOCK_CODES.orderNotPlaced);
  });

  it('the first change keeps what the employee ordered; later changes keep that first record; free units are the office\'s to plan and ride into Done', async () => {
    const { serverId } = await place.execute(mr1, order({ lines: [{ productId: 'prod1', quantity: 12, unitPricePaise: 1000, freeQty: 7 }] })); // an employee's free request is ignored
    expect((await orders.findById(serverId))?.items[0]?.freeQty).toBe(0);
    await edit.execute(acct, serverId, { remarks: null, lines: [{ productId: 'prod1', quantity: 10, unitPricePaise: 1000, freeQty: 2 }] });
    await edit.execute(acct, serverId, { remarks: null, lines: [{ productId: 'prod1', quantity: 9, unitPricePaise: 1000, freeQty: 2 }] });
    const changed = (await orders.findById(serverId))!;
    expect(changed.originalItems).toEqual([expect.objectContaining({ quantity: 12, unitPricePaise: 1000 })]);
    expect(changed.originalTotalAmountPaise).toBe(12_000);
    expect(changed.items[0]).toMatchObject({ quantity: 9, freeQty: 2 });
    const done = await markDone(acct, serverId);
    expect(done.items[0]).toMatchObject({ suppliedQty: 9, freeQty: 2 });
  });

  describe('discounts', () => {
    const dist = { type: 'DISTRIBUTOR' as const, id: 'dist1' };
    const two = [{ productId: 'prod1', quantity: 10, unitPricePaise: 10_000 }, { productId: 'prod2', quantity: 5, unitPricePaise: 10_000 }];

    it('the office discounts one line by percent or a flat amount, and the total is the sum of the nets', async () => {
      const { serverId } = await place.executeFor(acct, 'mr1', order({ outlet: dist, lines: [{ ...two[0]!, discount: { type: 'PERCENT', percent: 10 } }, { ...two[1]!, discount: { type: 'FIXED', amountPaise: 5_000 } }] }));
      const o = (await orders.findById(serverId))!;
      expect(o.items.map((i) => [i.amountPaise, i.netAmountPaise])).toEqual([[100_000, 90_000], [50_000, 45_000]]);
      expect(o.totalAmountPaise).toBe(135_000);
    });

    it('an order discount comes off the subtotal after line discounts and is shared into the lines exactly', async () => {
      const { serverId } = await place.executeFor(acct, 'mr1', order({ outlet: dist, lines: [{ ...two[0]!, discount: { type: 'PERCENT', percent: 10 } }, two[1]!], discount: { type: 'FIXED', amountPaise: 1_400 } }));
      const o = (await orders.findById(serverId))!;
      expect(o.orderDiscountPaise).toBe(1_400);
      expect(o.items.map((i) => i.netAmountPaise)).toEqual([89_100, 49_500]);
      expect(o.totalAmountPaise).toBe(138_600);
      const pct = (await orders.findById((await place.executeFor(acct, 'mr1', order({ outlet: dist, lines: two, discount: { type: 'PERCENT', percent: 2.5 } }))).serverId))!;
      expect(pct.totalAmountPaise).toBe(150_000 - 3_750);
      expect(pct.items.reduce((n, i) => n + (i.netAmountPaise ?? 0), 0)).toBe(pct.totalAmountPaise);
    });

    it('an employee’s own order never carries a discount; a chemist order cannot have one; a flat amount over the line or order is refused', async () => {
      const { serverId } = await place.execute(mr1, order({ lines: [{ ...two[0]!, discount: { type: 'PERCENT', percent: 50 } }], discount: { type: 'PERCENT', percent: 50 } }));
      expect((await orders.findById(serverId))?.totalAmountPaise).toBe(100_000);
      expect(await code(place.executeFor(acct, 'mr1', order({ outlet: { type: 'CHEMIST', id: 'chem1' }, lines: [{ ...two[0]!, discount: { type: 'PERCENT', percent: 5 } }] })))).toBe(STOCK_CODES.invalidPayload);
      expect(await code(place.executeFor(acct, 'mr1', order({ outlet: dist, lines: [{ ...two[0]!, discount: { type: 'FIXED', amountPaise: 100_001 } }] })))).toBe(STOCK_CODES.invalidPayload);
      expect(await code(place.executeFor(acct, 'mr1', order({ outlet: dist, lines: two, discount: { type: 'FIXED', amountPaise: 150_001 } })))).toBe(STOCK_CODES.invalidPayload);
    });

    it('the office can split one product across lines at different discounts; supply names the line, and a product alone is ambiguous', async () => {
      const split = [{ ...two[0]!, quantity: 6, discount: { type: 'PERCENT' as const, percent: 10 } }, { ...two[0]!, quantity: 4, discount: { type: 'PERCENT' as const, percent: 20 } }];
      const { serverId } = await place.executeFor(acct, 'mr1', order({ outlet: dist, lines: split }));
      expect((await orders.findById(serverId))!.items.map((i) => i.netAmountPaise)).toEqual([54_000, 32_000]);
      expect(await code(markDone(acct, serverId, [{ productId: 'prod1', suppliedQty: 1, freeQty: 0 }]))).toBe(STOCK_CODES.invalidPayload);
      expect(await code(markDone(acct, serverId, [{ productId: 'prod1', line: 0, suppliedQty: 1, freeQty: 0 }, { productId: 'prod1', line: 0, suppliedQty: 2, freeQty: 0 }]))).toBe(STOCK_CODES.invalidPayload);
      expect(await code(markDone(acct, serverId, [{ productId: 'prod2', line: 1, suppliedQty: 1, freeQty: 0 }]))).toBe(STOCK_CODES.productNotFound);
      const done = await markDone(acct, serverId, [{ productId: 'prod1', line: 1, suppliedQty: 2, freeQty: 1 }]);
      expect(done.items.map((i) => [i.suppliedQty, i.freeQty])).toEqual([[6, 0], [2, 1]]);
      expect(done.suppliedAmountPaise).toBe(54_000 + 16_000);
    });

    it('Admin or the Accountant add a discount while editing; Done values the supplied units at the net, a flat discount shrinking with the supply', async () => {
      const { serverId } = await place.executeFor(acct, 'mr1', order({ outlet: dist, lines: two }));
      const edited = await edit.execute(admin, serverId, { remarks: null, lines: [{ ...two[0]!, discount: { type: 'FIXED', amountPaise: 20_000 } }, two[1]!], discount: { type: 'PERCENT', percent: 10 } });
      // 100000 − 20000 = 80000, 50000; subtotal 130000; −10% = 13000.
      expect(edited.totalAmountPaise).toBe(117_000);
      const done = await markDone(acct, serverId, [{ productId: 'prod1', suppliedQty: 5, freeQty: 0 }]);
      // prod1 net 72000 × 5/10 = 36000; prod2 net 45000 in full.
      expect(done.suppliedAmountPaise).toBe(36_000 + 45_000);
      expect(done.totalAmountPaise).toBe(117_000);
    });
  });
});
