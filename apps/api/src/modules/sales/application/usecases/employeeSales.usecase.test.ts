import { beforeEach, describe, expect, it } from 'vitest';
import type { EmployeeSale, SecondaryStatus } from '../../domain/employeeSale.entity.js';
import type { EmployeeSaleFilter, EmployeeSaleRepositoryPort } from '../../domain/employeeSale.repository.port.js';
import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import type { OrderRepositoryPort, UserOrderSum } from '../../domain/order.repository.port.js';
import { StockRefusal } from '../../domain/stockRefusal.js';
import { SalesClock } from '../salesClock.js';
import type { SalesApprovalsPort } from '../../domain/approvals.port.js';
import { linkQtyAndAmount, makeSecondaryStatusHandler, ReadEmployeeSalesUseCase, SaveEmployeePrimaryUseCase, SaveEmployeeSecondaryUseCase, SubmitEmployeeSecondaryUseCase } from './employeeSales.usecase.js';
import { FakeMaster, FakeUsers } from './salesTestKit.js';

class FakeSales implements EmployeeSaleRepositoryPort {
  rows: EmployeeSale[] = [];
  async list(f: EmployeeSaleFilter) {
    return this.rows.filter((r) => r.month >= f.fromMonth && r.month <= f.toMonth && (!f.userIds || f.userIds.includes(r.userId)));
  }
  private row(userId: string, productId: string, month: string, by: string, at: Date) {
    let r = this.rows.find((x) => x.userId === userId && x.productId === productId && x.month === month);
    if (!r) this.rows.push((r = { id: `e${this.rows.length}`, userId, productId, month, secondaryQty: null, secondaryAmountPaise: null, secondaryStatus: 'DRAFT', adjustmentQty: 0, adjustmentReason: null, updatedBy: by, updatedAt: at, history: [] }));
    return r;
  }
  async setSecondary(userId: string, month: string, lines: Array<{ productId: string; qty: number; amountPaise: number | null }>, status: SecondaryStatus, by: string, at: Date) {
    for (const l of lines) Object.assign(this.row(userId, l.productId, month, by, at), { secondaryQty: l.qty, secondaryAmountPaise: l.amountPaise, secondaryStatus: status, updatedBy: by, updatedAt: at });
    return { added: lines.length, changed: 0 };
  }
  async setSecondaryStatus(userId: string, month: string, from: SecondaryStatus[], to: SecondaryStatus) {
    const hit = this.rows.filter((r) => r.userId === userId && r.month === month && r.secondaryQty !== null && from.includes(r.secondaryStatus));
    for (const r of hit) r.secondaryStatus = to;
    return hit.length;
  }
  async setAdjustment(userId: string, month: string, lines: Array<{ productId: string; qty: number; reason: string | null }>, by: string, at: Date) {
    for (const l of lines) Object.assign(this.row(userId, l.productId, month, by, at), { adjustmentQty: l.qty, adjustmentReason: l.reason, updatedBy: by, updatedAt: at });
    return { added: lines.length, changed: 0 };
  }
}

const submitted: Array<{ kind: string; recordId: string; submitterId: string }> = [];
const approvals = { registerKind() {}, getForRecord: async () => null, submit: async (i: { kind: string; recordId: string; submitterId: string }) => { submitted.push(i); return { id: 'req1' }; } } as unknown as SalesApprovalsPort;
let unlocked = false;
const stock = { async isUnlocked() { return unlocked; } } as unknown as MonthlyStockRepositoryPort;
const orderSums: UserOrderSum[] = [];
const orders = { async sumUserOrders() { return orderSums; } } as unknown as OrderRepositoryPort;
const config = { get: async (key: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', FY_START_MONTH: 'APRIL', FY_CLOSED_YEARS: 'NONE', MONTHLY_STOCK_DEADLINE_DAY: '5' })[key] ?? '' };
const admin = { id: 'admin', role: 'ADMIN' as const };
const asm = { id: 'asm', role: 'FIELD' as const };
const mr1 = { id: 'mr1', role: 'FIELD' as const };
const mr2 = { id: 'mr2', role: 'FIELD' as const };
const code = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof StockRefusal ? e.code : 'OTHER'));

describe('employee sales', () => {
  let sales: FakeSales;
  let secondary: SaveEmployeeSecondaryUseCase;
  let primary: SaveEmployeePrimaryUseCase;
  let read: ReadEmployeeSalesUseCase;
  let submit: SubmitEmployeeSecondaryUseCase;

  beforeEach(() => {
    unlocked = false;
    orderSums.length = 0;
    sales = new FakeSales();
    const clock = new SalesClock(config, () => new Date('2026-10-10T05:00:00Z'));
    const users = new FakeUsers();
    const master = new FakeMaster();
    secondary = new SaveEmployeeSecondaryUseCase(users, master, sales, stock, clock, config);
    primary = new SaveEmployeePrimaryUseCase(users, master, sales, clock, config);
    read = new ReadEmployeeSalesUseCase(users, master, sales, orders, clock);
    submit = new SubmitEmployeeSecondaryUseCase(sales, approvals, { run: (fn) => fn(undefined) }, clock, config);
    submitted.length = 0;
  });

  it('lets an employee enter their own secondary, a manager their team\'s, and nobody anyone else\'s', async () => {
    const body = { userId: 'mr1', month: '2026-10', lines: [{ productId: 'prod1', qty: 40 }] };
    expect(await code(secondary.execute(mr1, body))).toBeNull();
    expect(await code(secondary.execute(asm, body))).toBeNull();
    expect(await code(secondary.execute(admin, body))).toBeNull();
    expect(await code(secondary.execute(mr2, body))).toBe('NOT_YOUR_TEAM');
    expect(await code(secondary.execute(admin, { ...body, userId: 'admin' }))).toBe('EMPLOYEE_NOT_FOUND');
  });

  it('refuses a future month, whole-unit breaks and an inactive product; after the deadline only Admin or an unlocked month', async () => {
    const line = [{ productId: 'prod1', qty: 5 }];
    expect(await code(secondary.execute(mr1, { userId: 'mr1', month: '2026-11', lines: line }))).toBe('MONTH_NOT_STARTED');
    expect(await code(secondary.execute(mr1, { userId: 'mr1', month: '2026-10', lines: [{ productId: 'prod1', qty: 1.5 }] }))).toBe('INVALID_PAYLOAD');
    expect(await code(secondary.execute(mr1, { userId: 'mr1', month: '2026-10', lines: [{ productId: 'nope', qty: 1 }] }))).toBe('PRODUCT_NOT_FOUND');
    expect(await code(secondary.execute(mr1, { userId: 'mr1', month: '2026-08', lines: line }))).toBe('MONTH_CLOSED');
    expect(await code(secondary.execute(admin, { userId: 'mr1', month: '2026-08', lines: line }))).toBeNull();
    unlocked = true;
    expect(await code(secondary.execute(mr1, { userId: 'mr1', month: '2026-08', lines: [{ productId: 'prod2', qty: 5 }] }))).toBeNull();
  });

  it('changes primary only for Admin-sized reasons: a reason is needed for a non-zero change', async () => {
    const line = (adjustmentQty: number, reason?: string) => ({ userId: 'mr1', month: '2026-09', lines: [{ productId: 'prod1', adjustmentQty, reason }] });
    expect(await code(primary.execute(admin, line(10)))).toBe('ADJUSTMENT_NEEDS_REASON');
    expect(await code(primary.execute(admin, line(-4, 'Return')))).toBeNull();
    expect(await code(primary.execute(admin, { ...line(0), month: '2026-11' }))).toBe('MONTH_NOT_STARTED');
    expect(sales.rows[0]).toMatchObject({ adjustmentQty: -4, adjustmentReason: 'Return', secondaryQty: null });
  });

  it('reads primary as orders plus the change, and the secondary entered, per product', async () => {
    orderSums.push({ month: '2026-09', userId: 'mr1', distributorId: 'dist1', productId: 'prod1', quantity: 20, amountPaise: 2000 });
    await primary.execute(admin, { userId: 'mr1', month: '2026-09', lines: [{ productId: 'prod1', adjustmentQty: 5, reason: 'Direct supply' }] });
    await secondary.execute(admin, { userId: 'mr1', month: '2026-09', lines: [{ productId: 'prod1', qty: 12 }] });
    const dto = await read.execute(mr1, { userId: 'mr1', month: '2026-09' });
    expect(dto.lines.find((l) => l.product.id === 'prod1')).toMatchObject({ orderPrimaryQty: 20, adjustmentQty: 5, primaryQty: 25, secondaryQty: 12 });
    expect(dto.lines.find((l) => l.product.id === 'prod2')).toMatchObject({ orderPrimaryQty: 0, primaryQty: 0, secondaryQty: null });
    expect(await code(read.execute(mr2, { userId: 'mr1', month: '2026-09' }))).toBe('NOT_YOUR_TEAM');
  });

  it('units and amount are one figure at PTS: either given, both kept', async () => {
    expect(linkQtyAndAmount({ qty: 5 }, 1200)).toEqual({ qty: 5, amountPaise: 6000 });
    expect(linkQtyAndAmount({ amountPaise: 6100 }, 1200)).toEqual({ qty: 5, amountPaise: 6000 });
    expect(linkQtyAndAmount({ qty: 5 }, null)).toEqual({ qty: 5, amountPaise: null });
    expect(() => linkQtyAndAmount({ amountPaise: 100 }, null)).toThrow(/no PTS/);
    await secondary.execute(mr1, { userId: 'mr1', month: '2026-10', lines: [{ productId: 'prod1', amountPaise: 12_000 }] });
    expect(sales.rows[0]).toMatchObject({ secondaryQty: 12, secondaryAmountPaise: 12_000, secondaryStatus: 'DRAFT' });
  });

  it('own entry is a draft; a manager’s or Admin’s is approved at once', async () => {
    await secondary.execute(mr1, { userId: 'mr1', month: '2026-10', lines: [{ productId: 'prod1', qty: 3 }] });
    expect(sales.rows[0]!.secondaryStatus).toBe('DRAFT');
    await secondary.execute(asm, { userId: 'mr1', month: '2026-10', lines: [{ productId: 'prod1', qty: 4 }] });
    expect(sales.rows[0]).toMatchObject({ secondaryQty: 4, secondaryStatus: 'APPROVED' });
  });

  it('sending a month starts the approval; it is then locked for the employee until withdrawn or reopened', async () => {
    const line = (qty: number) => ({ userId: 'mr1', month: '2026-10', lines: [{ productId: 'prod1', qty }] });
    expect(await code(submit.execute(mr1, '2026-10'))).toBe('SECONDARY_NOTHING_TO_SEND');
    await secondary.execute(mr1, line(3));
    expect(await submit.execute(mr1, '2026-10')).toEqual({ requestId: 'req1', sent: 1 });
    expect(submitted[0]).toEqual({ kind: 'SECONDARY_SALES', recordId: 'mr1:2026-10', submitterId: 'mr1' });
    expect(sales.rows[0]!.secondaryStatus).toBe('PENDING');
    expect(await code(secondary.execute(mr1, line(9)))).toBe('SECONDARY_LOCKED');
    const onChange = makeSecondaryStatusHandler(sales);
    await onChange({ recordId: 'mr1:2026-10', status: 'APPROVED' }, undefined);
    expect(sales.rows[0]!.secondaryStatus).toBe('APPROVED');
    expect(await code(secondary.execute(mr1, line(9)))).toBe('SECONDARY_LOCKED');
    await onChange({ recordId: 'mr1:2026-10', status: 'REOPENED' }, undefined);
    expect(sales.rows[0]!.secondaryStatus).toBe('DRAFT');
    expect(await code(secondary.execute(mr1, line(9)))).toBeNull();
  });

  it('a rejected month can be corrected and sent again', async () => {
    await secondary.execute(mr1, { userId: 'mr1', month: '2026-10', lines: [{ productId: 'prod1', qty: 3 }] });
    await submit.execute(mr1, '2026-10');
    await makeSecondaryStatusHandler(sales)({ recordId: 'mr1:2026-10', status: 'REJECTED' }, undefined);
    expect(sales.rows[0]!.secondaryStatus).toBe('REJECTED');
    expect((await submit.execute(mr1, '2026-10')).sent).toBe(1);
  });
});
