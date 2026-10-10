import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyStock } from '../../domain/monthlyStock.entity.js';
import type { MonthlyStockRepositoryPort, StockRangeFilter } from '../../domain/monthlyStock.repository.port.js';
import type { DistributorOrderSum, OrderRepositoryPort } from '../../domain/order.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { StatementLine, StockStatement } from '../../domain/stockStatement.entity.js';
import type { StatementRangeFilter, StockStatementRepositoryPort } from '../../domain/stockStatement.repository.port.js';
import { SalesClock } from '../salesClock.js';
import { ReadStatementUseCase, SaveStatementUseCase, type SaveStatementInput } from './stockStatement.usecase.js';
import { FakeMaster, FakeUsers } from './salesTestKit.js';

class FakeStatements implements StockStatementRepositoryPort {
  rows: StockStatement[] = [];
  async list(f: StatementRangeFilter) {
    return this.rows.filter((r) => r.month >= f.fromMonth && r.month <= f.toMonth && (!f.distributorId || r.distributorId === f.distributorId));
  }
  async upsertMany(distributorId: string, month: string, lines: StatementLine[], by: string, at: Date) {
    let added = 0;
    let changed = 0;
    for (const l of lines) {
      const old = this.rows.find((r) => r.distributorId === distributorId && r.productId === l.productId && r.month === month);
      if (!old) {
        added++;
        this.rows.push({ id: `s${this.rows.length + 1}`, distributorId, productId: l.productId, month, openingQty: l.openingQty, secondaryQty: l.secondaryQty, adjustmentQty: l.adjustmentQty, adjustmentReason: l.reason, enteredBy: by, enteredAt: at, updatedBy: by, updatedAt: at, history: [] });
      } else if (old.openingQty !== l.openingQty || old.secondaryQty !== l.secondaryQty || old.adjustmentQty !== l.adjustmentQty || old.adjustmentReason !== l.reason) {
        changed++;
        old.history.push({ by: old.updatedBy, at: old.updatedAt, openingQty: old.openingQty, secondaryQty: old.secondaryQty, adjustmentQty: old.adjustmentQty, adjustmentReason: old.adjustmentReason });
        Object.assign(old, { openingQty: l.openingQty, secondaryQty: l.secondaryQty, adjustmentQty: l.adjustmentQty, adjustmentReason: l.reason, updatedBy: by, updatedAt: at });
      }
    }
    return { added, changed };
  }
}

const counts: MonthlyStock[] = [];
const stock = {
  async listRange(f: StockRangeFilter) {
    return counts.filter((c) => c.month >= f.fromMonth && c.month <= f.toMonth && (!f.outletId || c.outlet.id === f.outletId));
  },
} as unknown as MonthlyStockRepositoryPort;
const orderSums: DistributorOrderSum[] = [];
const orders = { async sumDistributorOrders() { return orderSums; } } as unknown as OrderRepositoryPort;

let closed = 'NONE';
const config = { get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', FY_START_MONTH: 'APRIL', FY_CLOSED_YEARS: closed })[key] ?? '' };
const admin = { id: 'admin', role: 'ADMIN' };
const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof StockRefusal ? e.code : e instanceof AppError ? `${e.statusCode}` : 'OTHER'));
const input = (lines: SaveStatementInput['lines'], month = '2026-09'): SaveStatementInput => ({ distributorId: 'dist1', month, lines });
const line = (over: Partial<SaveStatementInput['lines'][number]> = {}) => ({ productId: 'prod1', openingQty: 10, secondaryQty: 30, adjustmentQty: 0, reason: null, ...over });
const done = (month: string, productId: string, quantity: number): DistributorOrderSum => ({ month, distributorId: 'dist1', productId, status: 'DONE', quantity, amountPaise: quantity * 100 });
const count = (month: string, productId: string, openingQty: number, closingQty: number): MonthlyStock => ({ id: `c-${month}-${productId}`, outlet: { type: 'DISTRIBUTOR', id: 'dist1' }, productId, month, openingQty, closingQty, recordedBy: 'mr1', recordedAt: new Date('2026-10-02T05:00:00Z') });

describe('distributor statement', () => {
  let statements: FakeStatements;
  let save: SaveStatementUseCase;
  let read: ReadStatementUseCase;

  beforeEach(() => {
    closed = 'NONE';
    statements = new FakeStatements();
    counts.length = 0;
    orderSums.length = 0;
    const clock = new SalesClock(config, () => new Date('2026-10-09T06:00:00Z'));
    const master = new FakeMaster();
    save = new SaveStatementUseCase(master, statements, clock, config);
    read = new ReadStatementUseCase(master, statements, stock, orders, new FakeUsers(), clock);
  });

  it('saves lines, and changing one keeps its old values in the history; an identical save changes nothing', async () => {
    expect(await save.execute(admin, input([line(), line({ productId: 'prod2', secondaryQty: null })]))).toEqual({ added: 2, changed: 0 });
    expect(await save.execute(admin, input([line()]))).toEqual({ added: 0, changed: 0 });
    expect(await save.execute(admin, input([line({ secondaryQty: 25 })]))).toEqual({ added: 0, changed: 1 });
    const row = statements.rows.find((r) => r.productId === 'prod1')!;
    expect(row).toMatchObject({ secondaryQty: 25 });
    expect(row.history).toEqual([expect.objectContaining({ by: 'admin', secondaryQty: 30 })]);
  });

  it('an adjustment needs a reason; no adjustment drops any reason', async () => {
    expect(await code(save.execute(admin, input([line({ adjustmentQty: 5 })])))).toBe(STOCK_CODES.adjustmentNeedsReason);
    expect(await code(save.execute(admin, input([line({ adjustmentQty: -3, reason: '  ' })])))).toBe(STOCK_CODES.adjustmentNeedsReason);
    await save.execute(admin, input([line({ adjustmentQty: -3, reason: 'Returned damaged' })]));
    expect(statements.rows[0]).toMatchObject({ adjustmentQty: -3, adjustmentReason: 'Returned damaged' });
    await save.execute(admin, input([line({ adjustmentQty: 0, reason: 'left over' })]));
    expect(statements.rows[0]).toMatchObject({ adjustmentQty: 0, adjustmentReason: null });
  });

  it('refuses an unknown distributor, a future month, an inactive or unknown product, a closed financial year and fractions', async () => {
    expect(await code(save.execute(admin, { ...input([line()]), distributorId: 'nobody' }))).toBe(STOCK_CODES.outletNotFound);
    expect(await code(save.execute(admin, input([line()], '2026-11')))).toBe(STOCK_CODES.monthNotStarted);
    expect(await code(save.execute(admin, input([line({ productId: 'nope' })])))).toBe(STOCK_CODES.productNotFound);
    expect(await code(save.execute(admin, input([line({ openingQty: 1.5 })])))).toBe(STOCK_CODES.invalidPayload);
    closed = '2026';
    expect(await code(save.execute(admin, input([line()])))).toBe('409');
    expect(statements.rows).toHaveLength(0);
  });

  it('any past month can be entered, with no deadline', async () => {
    expect(await save.execute(admin, input([line()], '2026-04'))).toEqual({ added: 1, changed: 0 });
  });

  it('the grid lists every active product and works the figures out: orders + adjustment, derived closing', async () => {
    orderSums.push(done('2026-09', 'prod1', 40));
    await save.execute(admin, input([line({ openingQty: 10, secondaryQty: 30, adjustmentQty: 5, reason: 'Direct supply' })]));
    const grid = await read.execute({ distributorId: 'dist1', month: '2026-09' });
    expect(grid.lines.map((l) => l.product.id)).toEqual(['prod1', 'prod2']);
    expect(grid.lines[0]).toMatchObject({ saved: true, source: 'STATEMENT', openingQty: 10, orderPrimaryQty: 40, adjustmentQty: 5, adjustmentReason: 'Direct supply', primaryQty: 45, secondaryQty: 30, closingQty: 25, flags: [], updatedBy: { id: 'admin' } });
    expect(grid.lines[1]).toMatchObject({ saved: false, source: 'NONE', secondaryQty: null, closingQty: null });
  });

  it('shows the field count beside the statement and flags a difference', async () => {
    orderSums.push(done('2026-09', 'prod1', 40));
    counts.push(count('2026-09', 'prod1', 10, 99));
    await save.execute(admin, input([line()]));
    const l = (await read.execute({ distributorId: 'dist1', month: '2026-09' })).lines[0]!;
    expect(l).toMatchObject({ source: 'STATEMENT', closingQty: 20, count: { openingQty: 10, closingQty: 99, by: { id: 'mr1' } }, flags: ['COUNT_MISMATCH'] });
  });

  it('with no statement the field count is used, and the opening is suggested from it', async () => {
    orderSums.push(done('2026-09', 'prod1', 40));
    counts.push(count('2026-09', 'prod1', 10, 15));
    const l = (await read.execute({ distributorId: 'dist1', month: '2026-09' })).lines[0]!;
    expect(l).toMatchObject({ saved: false, source: 'FIELD_COUNT', openingQty: 10, openingSuggested: true, secondaryQty: 35, closingQty: 15 });
  });

  it('suggests last month’s closing as the opening and flags an opening that is not it', async () => {
    orderSums.push(done('2026-08', 'prod1', 20));
    await save.execute(admin, input([line({ openingQty: 0, secondaryQty: 5 })], '2026-08')); // closing 15
    expect((await read.execute({ distributorId: 'dist1', month: '2026-09' })).lines[0]).toMatchObject({ saved: false, openingQty: 15, openingSuggested: true });
    await save.execute(admin, input([line({ openingQty: 12, secondaryQty: 0 })]));
    expect((await read.execute({ distributorId: 'dist1', month: '2026-09' })).lines[0]!.flags).toContain('OPENING_MISMATCH');
  });

  it('opening follows last month\'s closing even when a field worker counted a different opening', async () => {
    orderSums.push(done('2026-08', 'prod1', 20));
    await save.execute(admin, input([line({ openingQty: 0, secondaryQty: 5 })], '2026-08')); // closing 15
    counts.push(count('2026-09', 'prod1', 9, 20));
    expect((await read.execute({ distributorId: 'dist1', month: '2026-09' })).lines[0]).toMatchObject({ saved: false, openingQty: 15, openingSuggested: true });
  });

  it('an unknown distributor is refused', async () => {
    expect(await code(read.execute({ distributorId: 'nobody', month: '2026-09' }))).toBe(STOCK_CODES.outletNotFound);
  });
});
