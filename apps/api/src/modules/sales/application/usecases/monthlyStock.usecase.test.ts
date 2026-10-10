import { beforeEach, describe, expect, it } from 'vitest';
import type { Outlet, MonthlyStock, StockLine } from '../../domain/monthlyStock.entity.js';
import type { MonthlyStockRepositoryPort, StockFilter } from '../../domain/monthlyStock.repository.port.js';
import { FakeMaster, FakeUsers, config } from './salesTestKit.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import { OutletAccess } from '../outletAccess.js';
import { SalesClock } from '../salesClock.js';
import { ListMissingStockUseCase, ListMonthlyStockUseCase } from './readMonthlyStock.usecase.js';
import { RecordMonthlyStockUseCase } from './recordMonthlyStock.usecase.js';
import { UnlockMonthUseCase } from './unlockMonth.usecase.js';

const k = (o: Outlet) => `${o.type}:${o.id}`;

class FakeStock implements MonthlyStockRepositoryPort {
  rows = new Map<string, MonthlyStock>();
  unlocked = new Set<string>();
  async upsertMany(outlet: Outlet, month: string, lines: StockLine[], by: string, at: Date) {
    for (const l of lines) this.rows.set(`${k(outlet)}|${l.productId}|${month}`, { id: `${this.rows.size}`, outlet, productId: l.productId, month, openingQty: l.openingQty, closingQty: l.closingQty, recordedBy: by, recordedAt: at });
  }
  async listRange(f: { fromMonth: string; toMonth: string; outletType: Outlet['type']; outletId?: string | undefined; productId?: string | undefined }) {
    return [...this.rows.values()].filter((r) => r.outlet.type === f.outletType && r.month >= f.fromMonth && r.month <= f.toMonth && (!f.outletId || r.outlet.id === f.outletId) && (!f.productId || r.productId === f.productId));
  }
  async list(f: StockFilter) {
    const scope = f.outlets ? new Set(f.outlets.map(k)) : null;
    return [...this.rows.values()].filter((r) => (!f.month || r.month === f.month) && (!f.productId || r.productId === f.productId) && (!scope || scope.has(k(r.outlet))));
  }
  async outletsWithStock(month: string, outlets: Outlet[]) {
    const have = new Set([...this.rows.values()].filter((r) => r.month === month).map((r) => k(r.outlet)));
    return outlets.filter((o) => have.has(k(o)));
  }
  async isUnlocked(month: string) {
    return this.unlocked.has(month);
  }
  async unlock(month: string) {
    this.unlocked.add(month);
  }
}

const line = (productId = 'prod1', openingQty = 10, closingQty = 4): StockLine => ({ productId, openingQty, closingQty });
const mr1 = { id: 'mr1', role: 'FIELD' };

describe('monthly stock', () => {
  let now: Date;
  let stock: FakeStock;
  let master: FakeMaster;
  let record: RecordMonthlyStockUseCase;
  const clock = () => new SalesClock(config, () => now);

  beforeEach(() => {
    now = new Date('2026-09-30T10:00:00+05:30');
    stock = new FakeStock();
    master = new FakeMaster();
    record = new RecordMonthlyStockUseCase(new OutletAccess(master), master, stock, clock());
  });

  const code = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof StockRefusal ? e.code : 'OTHER'));

  it('a count for a month of a closed financial year is refused, for an MR and for Admin', async () => {
    const closedYear = { get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', MONTHLY_STOCK_DEADLINE_DAY: '5', FY_START_MONTH: 'APRIL', FY_CLOSED_YEARS: '2026' })[key] ?? '' };
    const closedRecord = new RecordMonthlyStockUseCase(new OutletAccess(master), master, stock, new SalesClock(closedYear, () => now), closedYear);
    for (const actor of [mr1, { id: 'admin', role: 'ADMIN' }]) {
      await expect(closedRecord.execute(actor, { outlet: { type: 'DISTRIBUTOR', id: 'dist1' }, month: '2026-09', lines: [line()] })).rejects.toMatchObject({ statusCode: 409 });
    }
    expect(stock.rows.size).toBe(0);
  });

  it('an MR records a Chemist and a Distributor on the last day of the month', async () => {
    await record.execute(mr1, { outlet: { type: 'CHEMIST', id: 'chem1' }, month: '2026-09', lines: [line('prod1'), line('prod2', 5, 5)] });
    await record.execute(mr1, { outlet: { type: 'DISTRIBUTOR', id: 'dist1' }, month: '2026-09', lines: [line()] });
    expect(stock.rows.size).toBe(3);
  });

  it('a second entry overwrites (one row per outlet, product and month) — also a replayed sync record', async () => {
    const input = { outlet: { type: 'CHEMIST', id: 'chem1' } as Outlet, month: '2026-09', lines: [line('prod1', 10, 4)] };
    await record.execute(mr1, input);
    await record.execute(mr1, { ...input, lines: [line('prod1', 10, 2)] });
    expect(stock.rows.size).toBe(1);
    expect([...stock.rows.values()][0]!.closingQty).toBe(2);
  });

  it('refuses another MR’s outlet, but Admin may enter for any', async () => {
    const input = { outlet: { type: 'CHEMIST', id: 'chem2' } as Outlet, month: '2026-09', lines: [line()] };
    expect(await code(record.execute(mr1, input))).toBe(STOCK_CODES.outletNotYours);
    await record.execute({ id: 'admin', role: 'ADMIN' }, input);
    expect(stock.rows.size).toBe(1);
  });

  it('refuses an unknown outlet or product', async () => {
    expect(await code(record.execute(mr1, { outlet: { type: 'CHEMIST', id: 'nope' }, month: '2026-09', lines: [line()] }))).toBe(STOCK_CODES.outletNotFound);
    expect(await code(record.execute(mr1, { outlet: { type: 'CHEMIST', id: 'chem1' }, month: '2026-09', lines: [line('bad')] }))).toBe(STOCK_CODES.productNotFound);
    master.inactiveProducts.add('prod1');
    expect(await code(record.execute(mr1, { outlet: { type: 'CHEMIST', id: 'chem1' }, month: '2026-09', lines: [line('prod1')] }))).toBe(STOCK_CODES.productNotFound);
    expect(stock.rows.size).toBe(0);
  });

  it('accepts through the deadline day of the next month', async () => {
    now = new Date('2026-10-05T23:59:00+05:30');
    await record.execute(mr1, { outlet: { type: 'CHEMIST', id: 'chem1' }, month: '2026-09', lines: [line()] });
    expect(stock.rows.size).toBe(1);
  });

  it('refuses after the deadline day, until an Admin unlocks that month', async () => {
    now = new Date('2026-10-06T00:00:01+05:30');
    const input = { outlet: { type: 'CHEMIST', id: 'chem1' } as Outlet, month: '2026-09', lines: [line()] };
    expect(await code(record.execute(mr1, input))).toBe(STOCK_CODES.monthClosed);
    await new UnlockMonthUseCase(stock, clock()).execute('admin', '2026-09');
    await record.execute(mr1, input);
    expect(stock.rows.size).toBe(1);
    // …and only that month.
    expect(await code(record.execute(mr1, { ...input, month: '2026-08' }))).toBe(STOCK_CODES.monthClosed);
  });

  it('Admin may correct a closed month without an unlock', async () => {
    now = new Date('2026-10-20T10:00:00+05:30');
    await record.execute({ id: 'admin', role: 'ADMIN' }, { outlet: { type: 'CHEMIST', id: 'chem1' }, month: '2026-09', lines: [line()] });
    expect(stock.rows.size).toBe(1);
  });

  it('refuses a month that has not started', async () => {
    expect(await code(record.execute(mr1, { outlet: { type: 'CHEMIST', id: 'chem1' }, month: '2026-10', lines: [line()] }))).toBe(STOCK_CODES.monthNotStarted);
  });

  it('lists an MR’s own outlets, a manager’s team, and Admin’s everything', async () => {
    for (const [u, type, id] of [['mr1', 'CHEMIST', 'chem1'], ['mr2', 'CHEMIST', 'chem2']] as const) await record.execute({ id: u, role: 'FIELD' }, { outlet: { type, id }, month: '2026-09', lines: [line()] });
    const list = new ListMonthlyStockUseCase(stock, master, new FakeUsers());
    expect((await list.execute(mr1, {})).map((r) => r.outlet.id)).toEqual(['chem1']);
    expect((await list.execute({ id: 'asm', role: 'FIELD' }, {})).length).toBe(2);
    expect((await list.execute({ id: 'admin', role: 'ADMIN' }, { month: '2026-09' })).length).toBe(2);
    expect(await list.execute({ id: 'admin', role: 'ADMIN' }, { month: '2026-08' })).toEqual([]);
  });

  it('reports, per MR, the outlets with no count', async () => {
    await record.execute(mr1, { outlet: { type: 'CHEMIST', id: 'chem1' }, month: '2026-09', lines: [line()] });
    const missing = new ListMissingStockUseCase(stock, master, new FakeUsers());
    const forAdmin = await missing.execute({ id: 'admin', role: 'ADMIN' }, '2026-09');
    expect(forAdmin.map((r) => [r.userId, r.outlets.map(k)])).toEqual([['mr1', ['DISTRIBUTOR:dist1']], ['mr2', ['CHEMIST:chem2']]]);
    // A manager sees only their downline; an MR with no downline sees nothing.
    expect((await missing.execute({ id: 'asm', role: 'FIELD' }, '2026-09')).length).toBe(2);
    expect(await missing.execute(mr1, '2026-09')).toEqual([]);
  });
});
