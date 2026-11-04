import { beforeEach, describe, expect, it } from 'vitest';
import type { SalesApprovalsPort } from '../../domain/approvals.port.js';
import { StockRefusal } from '../../domain/stockRefusal.js';
import { OutletAccess } from '../outletAccess.js';
import { SalesClock } from '../salesClock.js';
import { RecordMonthlyStockUseCase } from './recordMonthlyStock.usecase.js';
import { DeleteStockCountsUseCase, makeStockCountStatusHandler, monthStatusOf, SubmitStockCountsUseCase } from './stockCounts.usecase.js';
import { FakeMaster, FakeStock, config } from './salesTestKit.js';

const submitted: Array<{ kind: string; recordId: string; submitterId: string }> = [];
const removed: string[] = [];
const approvals = {
  registerKind() {},
  getForRecord: async () => null,
  deleteForRecord: async (_k: string, id: string) => void removed.push(id),
  submit: async (i: { kind: string; recordId: string; submitterId: string }) => (submitted.push(i), { id: 'req1' }),
} as unknown as SalesApprovalsPort;
const run = { run: <T>(fn: (ctx: undefined) => Promise<T>) => fn(undefined) };
const onConfig = { get: async (k: string) => (k === 'STOCK_COUNT_APPROVAL' ? 'true' : config.get(k)) };
const line = (productId = 'prod1') => ({ productId, openingQty: 10, closingQty: 4 });
const dist1 = { type: 'DISTRIBUTOR' as const, id: 'dist1' };
const mr1 = { id: 'mr1', role: 'FIELD' };

describe('distributor counts with approval on', () => {
  let stock: FakeStock;
  let master: FakeMaster;
  let record: RecordMonthlyStockUseCase;
  let submit: SubmitStockCountsUseCase;
  const now = new Date('2026-09-30T10:00:00+05:30');
  const clock = () => new SalesClock(onConfig, () => now);

  beforeEach(() => {
    submitted.length = 0;
    removed.length = 0;
    stock = new FakeStock();
    master = new FakeMaster();
    record = new RecordMonthlyStockUseCase(new OutletAccess(master), master, stock, clock(), onConfig);
    submit = new SubmitStockCountsUseCase(stock, approvals, run, clock(), onConfig);
  });

  it('an employee’s count is a draft, and is not counted until approved', async () => {
    await record.execute(mr1, { outlet: dist1, month: '2026-09', lines: [line()] });
    expect([...stock.rows.values()][0]?.status).toBe('DRAFT');
    expect(await stock.listRange({ fromMonth: '2026-09', toMonth: '2026-09', outletType: 'DISTRIBUTOR' })).toEqual([]);
  });

  it('Admin’s count is final at once', async () => {
    await record.execute({ id: 'admin', role: 'ADMIN' }, { outlet: dist1, month: '2026-09', lines: [line()] });
    expect([...stock.rows.values()][0]?.status).toBe('APPROVED');
    expect(await stock.listRange({ fromMonth: '2026-09', toMonth: '2026-09', outletType: 'DISTRIBUTOR' })).toHaveLength(1);
  });

  it('a chemist count is never held for approval', async () => {
    await record.execute(mr1, { outlet: { type: 'CHEMIST', id: 'chem1' }, month: '2026-09', lines: [line()] });
    expect([...stock.rows.values()][0]?.status).toBeUndefined();
  });

  it('sending the month makes the counts pending and starts one request; nothing to send is refused', async () => {
    await expect(submit.execute(mr1, '2026-09')).rejects.toBeInstanceOf(StockRefusal);
    await record.execute(mr1, { outlet: dist1, month: '2026-09', lines: [line('prod1'), line('prod2')] });
    expect(await submit.execute(mr1, '2026-09')).toEqual({ requestId: 'req1', sent: 2 });
    expect(submitted).toEqual([{ kind: 'STOCK_COUNT', recordId: 'mr1:2026-09', submitterId: 'mr1' }]);
    expect([...stock.rows.values()].map((r) => r.status)).toEqual(['PENDING', 'PENDING']);
  });

  it('a pending or approved month is locked to the employee, and opens again after a rejection', async () => {
    await record.execute(mr1, { outlet: dist1, month: '2026-09', lines: [line()] });
    await submit.execute(mr1, '2026-09');
    await expect(record.execute(mr1, { outlet: dist1, month: '2026-09', lines: [line()] })).rejects.toMatchObject({ code: 'SECONDARY_LOCKED' });
    await makeStockCountStatusHandler(stock, master)({ recordId: 'mr1:2026-09', status: 'REJECTED' }, undefined as never);
    await record.execute(mr1, { outlet: dist1, month: '2026-09', lines: [line()] });
    expect([...stock.rows.values()][0]?.status).toBe('DRAFT');
  });

  it('approving counts the month and fixes who it counts toward; withdrawing puts it back to a draft', async () => {
    const handler = makeStockCountStatusHandler(stock, { getDistributor: async () => ({ id: 'dist1', name: 'D', status: 'active' as const, assignedUserIds: ['mr1', 'mr2'] }) });
    await record.execute(mr1, { outlet: dist1, month: '2026-09', lines: [line()] });
    await submit.execute(mr1, '2026-09');
    await handler({ recordId: 'mr1:2026-09', status: 'APPROVED' }, undefined as never);
    const row = [...stock.rows.values()][0]!;
    expect(row.status).toBe('APPROVED');
    expect(row.creditedUserIds).toEqual(['mr1', 'mr2']);
    expect(await stock.listRange({ fromMonth: '2026-09', toMonth: '2026-09', outletType: 'DISTRIBUTOR' })).toHaveLength(1);
    await handler({ recordId: 'mr1:2026-09', status: 'WITHDRAWN' }, undefined as never);
    expect([...stock.rows.values()][0]).toMatchObject({ status: 'DRAFT', creditedUserIds: [] });
  });

  it('Admin deletes the month: the counts and the request go, and only Admin may', async () => {
    const del = new DeleteStockCountsUseCase(stock, approvals, run, clock(), onConfig);
    await record.execute(mr1, { outlet: dist1, month: '2026-09', lines: [line()] });
    await expect(del.execute(mr1, { userId: 'mr1', month: '2026-09' })).rejects.toMatchObject({ code: 'ADMIN_ONLY' });
    expect(await del.preview({ id: 'admin', role: 'ADMIN' }, { userId: 'mr1', month: '2026-09' })).toEqual({ distributors: 1, lines: 1, requestWaiting: false });
    await del.execute({ id: 'admin', role: 'ADMIN' }, { userId: 'mr1', month: '2026-09' });
    expect(stock.rows.size).toBe(0);
  });
});

describe('monthStatusOf', () => {
  it('is only approved when every distributor is, and shows the unfinished one first', () => {
    expect(monthStatusOf([])).toBe('NOT_ENTERED');
    expect(monthStatusOf(['APPROVED', 'APPROVED'])).toBe('APPROVED');
    expect(monthStatusOf(['APPROVED', 'PENDING'])).toBe('PENDING');
    expect(monthStatusOf(['PENDING', 'REJECTED'])).toBe('REJECTED');
  });
});
