import { beforeEach, describe, expect, it } from 'vitest';
import type { SalesApprovalsPort } from '../../domain/approvals.port.js';
import type { OrderRepositoryPort } from '../../domain/order.repository.port.js';
import { StockRefusal } from '../../domain/stockRefusal.js';
import { SalesClock } from '../salesClock.js';
import { FakeLines, FakeMaster, FakeStock, FakeUsers, config } from './salesTestKit.js';
import { makeSecondaryStockStatusHandler, ReadSecondaryStockUseCase, SaveSecondaryStockUseCase, SubmitSecondaryStockUseCase } from './secondaryStock.usecase.js';

const submitted: string[] = [];
const approvals = { submit: async (i: { recordId: string }) => (submitted.push(i.recordId), { id: 'req1' }) } as unknown as SalesApprovalsPort;
const run = { run: <T>(fn: (ctx: undefined) => Promise<T>) => fn(undefined) };
const mr1 = { id: 'mr1', role: 'FIELD' };
const line = (o: Partial<{ distributorId: string; productId: string; openingQty: number; primaryQty: number; issuedQty: number }> = {}) => ({ distributorId: 'dist1', productId: 'prod1', openingQty: 10, primaryQty: 20, issuedQty: 5, ...o });

describe('MR secondary stock', () => {
  const now = new Date('2026-09-30T10:00:00+05:30');
  const clock = new SalesClock(config, () => now);
  let lines: FakeLines;
  let master: FakeMaster;
  let save: SaveSecondaryStockUseCase;
  let orders: { sumUserOrders: () => Promise<unknown[]> };
  let read: ReadSecondaryStockUseCase;

  beforeEach(() => {
    submitted.length = 0;
    lines = new FakeLines();
    master = new FakeMaster();
    orders = { sumUserOrders: async () => [] };
    save = new SaveSecondaryStockUseCase({ users: new FakeUsers(), master, lines, stock: new FakeStock(), clock, config });
    read = new ReadSecondaryStockUseCase(new FakeUsers(), master, lines, orders as unknown as OrderRepositoryPort, clock);
  });

  it('saves drafts; closing = opening + primary − issued, valued at PTS', async () => {
    await save.execute(mr1, { month: '2026-09', lines: [line()] });
    const dto = await read.execute(mr1, { userId: 'mr1', month: '2026-09' });
    const l = dto.distributors[0]!.lines.find((x) => x.product.id === 'prod1')!;
    expect([l.openingQty, l.primaryQty, l.issuedQty, l.closingQty]).toEqual([10, 20, 5, 25]);
    expect(l.issuedAmountPaise).toBe(5000);
    expect(l.closingAmountPaise).toBe(25000);
    expect(dto.status).toBe('DRAFT');
    expect(dto.totals.closingQty).toBe(25);
  });

  it('refuses a manager, a non-assigned distributor, fractions, and issuing more than is there', async () => {
    await expect(save.execute({ id: 'asm', role: 'FIELD' }, { month: '2026-09', lines: [line()] })).rejects.toMatchObject({ code: 'MR_ONLY' });
    await expect(save.execute({ id: 'admin', role: 'ADMIN' }, { month: '2026-09', lines: [line()] })).rejects.toMatchObject({ code: 'MR_ONLY' });
    await expect(save.execute({ id: 'mr2', role: 'FIELD' }, { month: '2026-09', lines: [line()] })).rejects.toMatchObject({ code: 'OUTLET_NOT_YOURS' });
    await expect(save.execute(mr1, { month: '2026-09', lines: [line({ issuedQty: 1.5 })] })).rejects.toBeInstanceOf(StockRefusal);
    await expect(save.execute(mr1, { month: '2026-09', lines: [line({ issuedQty: 31 })] })).rejects.toBeInstanceOf(StockRefusal);
  });

  it('defaults opening to last month’s approved closing and primary to the MR’s own Done orders, and flags edits', async () => {
    await lines.upsertMany('mr1', '2026-08', [line()], 'APPROVED', now);
    orders.sumUserOrders = async () => [{ month: '2026-09', userId: 'mr1', distributorId: 'dist1', productId: 'prod1', quantity: 12, amountPaise: 0 }];
    let l = (await read.execute(mr1, { userId: 'mr1', month: '2026-09' })).distributors[0]!.lines.find((x) => x.product.id === 'prod1')!;
    expect([l.openingQty, l.primaryQty, l.saved]).toEqual([25, 12, false]);
    await save.execute(mr1, { month: '2026-09', lines: [line({ openingQty: 20, primaryQty: 12, issuedQty: 3 })] });
    l = (await read.execute(mr1, { userId: 'mr1', month: '2026-09' })).distributors[0]!.lines.find((x) => x.product.id === 'prod1')!;
    expect([l.openingEdited, l.primaryEdited]).toEqual([true, false]);
  });

  it('a draft or sent month does not count; approving makes it count; sent months are locked', async () => {
    const submit = new SubmitSecondaryStockUseCase(new FakeUsers(), lines, approvals, run, clock, config);
    await expect(submit.execute(mr1, '2026-09')).rejects.toMatchObject({ code: 'SECONDARY_NOTHING_TO_SEND' });
    await save.execute(mr1, { month: '2026-09', lines: [line()] });
    expect(await lines.listRange({ fromMonth: '2026-09', toMonth: '2026-09' })).toEqual([]);
    expect((await submit.execute(mr1, '2026-09')).sent).toBe(1);
    expect(submitted).toEqual(['mr1:2026-09']);
    await expect(save.execute(mr1, { month: '2026-09', lines: [line()] })).rejects.toMatchObject({ code: 'SECONDARY_LOCKED' });
    const handle = makeSecondaryStockStatusHandler(lines);
    await handle({ recordId: 'mr1:2026-09', status: 'APPROVED' }, undefined as never);
    expect(await lines.listRange({ fromMonth: '2026-09', toMonth: '2026-09' })).toHaveLength(1);
    await handle({ recordId: 'mr1:2026-09', status: 'REOPENED' }, undefined as never);
    await save.execute(mr1, { month: '2026-09', lines: [line({ issuedQty: 6 })] });
  });

  it('two MRs on one distributor add up once: issued 2 + 4 = 6, never doubled', async () => {
    master.outlets.mr2!.distributors = ['dist1'];
    await save.execute(mr1, { month: '2026-09', lines: [line({ openingQty: 0, primaryQty: 10, issuedQty: 2 })] });
    await save.execute({ id: 'mr2', role: 'FIELD' }, { month: '2026-09', lines: [line({ openingQty: 0, primaryQty: 10, issuedQty: 4 })] });
    for (const u of ['mr1', 'mr2']) await lines.setStatus({ userId: u, month: '2026-09' }, ['DRAFT'], 'APPROVED');
    const all = await lines.listRange({ fromMonth: '2026-09', toMonth: '2026-09' });
    expect(all.reduce((n, r) => n + r.issuedQty, 0)).toBe(6);
  });
});
