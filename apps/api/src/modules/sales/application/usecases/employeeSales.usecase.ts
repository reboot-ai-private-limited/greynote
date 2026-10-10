import type { EmployeeSalesDto, EmployeeSalesLineDto } from '@greynote/contracts';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { monthRange } from '@/shared/time/businessTime.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { EmployeeSaleRepositoryPort } from '../../domain/employeeSale.repository.port.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import type { OrderRepositoryPort } from '../../domain/order.repository.port.js';
import { monthWindow } from '../../domain/stockDeadline.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../outletAccess.js';
import type { SalesClock } from '../salesClock.js';

const UNKNOWN = '(removed)';
const MAX_QTY = 100_000_000;

/**
 * Whose figures the actor may touch: Admin anyone's; a field employee their own and, as a manager, their downline's. The subject must be an
 * active field employee.
 */
async function assertMayAct(users: UserDirectoryPort, actor: Actor, userId: string): Promise<void> {
  const [subject] = await users.getUserSummaries([userId]);
  if (!subject || subject.status !== 'active' || subject.role !== 'FIELD') throw new StockRefusal(STOCK_CODES.employeeNotFound, 'That employee does not exist or is not an active field employee.');
  if (actor.role === 'ADMIN' || actor.id === userId) return;
  const downline = actor.role === 'FIELD' ? await users.getDownline(actor.id) : [];
  if (!downline.some((u) => u.id === userId)) throw new StockRefusal(STOCK_CODES.notYourTeam, 'You can only work with your own figures and your team\'s.');
}

async function assertWhole(master: FieldMasterDataPort, productIds: string[], quantities: number[], min: number): Promise<void> {
  for (const id of productIds) {
    const product = await master.getProduct(id);
    if (!product || product.status !== 'active') throw new StockRefusal(STOCK_CODES.productNotFound, 'A product in the list does not exist or is no longer active.');
  }
  for (const n of quantities) if (!Number.isInteger(n) || n < min || n > MAX_QTY) throw new StockRefusal(STOCK_CODES.invalidPayload, 'Quantities are whole units.');
}

/**
 * The secondary an employee sold, per product and month. The employee enters their own; Admin or the manager above can enter it for them. There is
 * no distributor: this is the employee's achievement and never changes a distributor's stock. The month must have started and its financial year
 * be open; after the stock deadline only Admin, or a month Admin has unlocked, takes entries — the same window as the stock counts.
 */
export class SaveEmployeeSecondaryUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly sales: EmployeeSaleRepositoryPort,
    private readonly stock: MonthlyStockRepositoryPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
  ) {}

  async execute(actor: Actor, input: { userId: string; month: string; lines: Array<{ productId: string; qty: number }> }): Promise<{ added: number; changed: number }> {
    await assertMayAct(this.users, actor, input.userId);
    const now = this.clock.now();
    const window = monthWindow(input.month, now, await this.clock.deadlineDay(), await this.clock.timeZone(), await this.clock.dayStart());
    if (window === 'FUTURE') throw new StockRefusal(STOCK_CODES.monthNotStarted, `${input.month} has not started yet.`);
    if (window === 'CLOSED' && actor.role !== 'ADMIN' && !(await this.stock.isUnlocked(input.month))) {
      throw new StockRefusal(STOCK_CODES.monthClosed, `The deadline for ${input.month} has passed. Ask an Admin to reopen it.`);
    }
    await assertFinancialYearOpen(this.config, `${input.month}-01`, 'This month');
    await assertWhole(this.master, input.lines.map((l) => l.productId), input.lines.map((l) => l.qty), 0);
    return this.sales.setSecondary(input.userId, input.month, input.lines, actor.id, now);
  }
}

/**
 * Admin's change to an employee's primary for a month (their Done distributor orders stay as they are): units added, or taken off with a minus
 * sign, with a reason. Any past month of an open financial year; no deadline for Admin.
 */
export class SaveEmployeePrimaryUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly sales: EmployeeSaleRepositoryPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
  ) {}

  async execute(actor: Actor, input: { userId: string; month: string; lines: Array<{ productId: string; adjustmentQty: number; reason?: string | null | undefined }> }): Promise<{ added: number; changed: number }> {
    await assertMayAct(this.users, actor, input.userId);
    const today = await this.clock.today();
    if (input.month > today.slice(0, 7)) throw new StockRefusal(STOCK_CODES.monthNotStarted, `${input.month} has not started yet.`);
    await assertFinancialYearOpen(this.config, `${input.month}-01`, 'This month');
    await assertWhole(this.master, input.lines.map((l) => l.productId), [], 0);
    const lines = input.lines.map((l) => {
      if (!Number.isInteger(l.adjustmentQty) || Math.abs(l.adjustmentQty) > MAX_QTY) throw new StockRefusal(STOCK_CODES.invalidPayload, 'Quantities are whole units.');
      const reason = l.reason?.trim() || null;
      if (l.adjustmentQty !== 0 && !reason) throw new StockRefusal(STOCK_CODES.adjustmentNeedsReason, 'Say why the primary is changed.');
      return { productId: l.productId, qty: l.adjustmentQty, reason: l.adjustmentQty === 0 ? null : reason };
    });
    return this.sales.setAdjustment(input.userId, input.month, lines, actor.id, this.clock.now());
  }
}

/** One employee's month by product: Done distributor orders (primary), Admin's change, and the secondary they entered. Reads only. */
export class ReadEmployeeSalesUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly sales: EmployeeSaleRepositoryPort,
    private readonly orders: OrderRepositoryPort,
    private readonly clock: SalesClock,
  ) {}

  async execute(actor: Actor, input: { userId: string; month: string }): Promise<EmployeeSalesDto> {
    await assertMayAct(this.users, actor, input.userId);
    const { from, to } = monthRange(input.month);
    const [products, saved, orderSums] = await Promise.all([
      this.master.listActiveProducts(),
      this.sales.list({ userIds: [input.userId], fromMonth: input.month, toMonth: input.month }, 5000),
      this.orders.sumUserOrders({ from, to, timeZone: await this.clock.timeZone(), dayStart: await this.clock.dayStart(), userIds: [input.userId] }),
    ]);
    const byProduct = new Map(saved.map((s) => [s.productId, s]));
    const ordered = new Map(orderSums.filter((o) => o.month === input.month).map((o) => [o.productId, o.quantity]));
    const people = await this.users.getUserSummaries([...new Set(saved.map((s) => s.updatedBy))]);
    const lines: EmployeeSalesLineDto[] = products
      .map((p): EmployeeSalesLineDto => {
        const s = byProduct.get(p.id);
        const orderPrimaryQty = ordered.get(p.id) ?? 0;
        return {
          product: { id: p.id, name: p.name, sku: p.sku },
          orderPrimaryQty,
          adjustmentQty: s?.adjustmentQty ?? 0,
          adjustmentReason: s?.adjustmentReason ?? null,
          primaryQty: orderPrimaryQty + (s?.adjustmentQty ?? 0),
          secondaryQty: s?.secondaryQty ?? null,
          updatedBy: s ? { id: s.updatedBy, name: people.find((u) => u.id === s.updatedBy)?.name ?? UNKNOWN } : null,
          updatedAt: s ? s.updatedAt.toISOString() : null,
        };
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
    return { userId: input.userId, month: input.month, lines };
  }
}
