import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { MAX_PAISE, type Paise } from '@/shared/money/paise.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { Outlet } from '../../domain/monthlyStock.entity.js';
import type { Order, OrderItem, OrderStatus } from '../../domain/order.entity.js';
import type { OrderRepositoryPort } from '../../domain/order.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor, OutletAccess } from '../outletAccess.js';
import type { SalesClock } from '../salesClock.js';

const LIMIT = 500;

export interface PlaceOrderInput {
  outlet: Outlet;
  /** `YYYY-MM-DD`; defaults to today. */
  orderDate?: string | undefined;
  remarks: string | null;
  lines: Array<{ productId: string; quantity: number; unitPricePaise: Paise }>;
}

/**
 * An order for a Chemist or Distributor on the MR's Routes (LLD sales-and-orders.md, *Orders*). It is visible and
 * actionable the moment it is written — nothing to approve. Each line's amount and the order's total are computed
 * here from quantity and unit price; the phone's own arithmetic is never trusted. `clientId` (sync) is kept with the order, and a unique index
 * refuses a second order for the same phone record — the sync receipts stop a retry before it gets here.
 */
export class PlaceOrderUseCase {
  constructor(
    private readonly access: OutletAccess,
    private readonly master: FieldMasterDataPort,
    private readonly orders: OrderRepositoryPort,
    private readonly clock: SalesClock,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, input: PlaceOrderInput, clientId: string | null = null, ctx?: TransactionContext): Promise<{ serverId: string; totalAmountPaise: Paise }> {
    await this.access.assertUsable(actor, input.outlet);
    return this.write(actor.id, null, input, clientId, ctx);
  }

  /** Admin or the Accountant adds an order for a field employee, credited to that employee; the outlet need not be on their Routes. */
  async executeFor(office: Actor, employeeId: string, input: PlaceOrderInput): Promise<{ serverId: string; totalAmountPaise: Paise }> {
    const [employee] = await this.users.getUserSummaries([employeeId]);
    if (!employee || employee.role !== 'FIELD' || employee.status !== 'active') throw new StockRefusal(STOCK_CODES.employeeNotFound, 'That is not an active field employee.');
    await this.access.assertUsable(office, input.outlet);
    return this.write(employeeId, office.id, input, null);
  }

  private async write(userId: string, createdBy: string | null, input: PlaceOrderInput, clientId: string | null, ctx?: TransactionContext): Promise<{ serverId: string; totalAmountPaise: Paise }> {
    const today = await this.clock.today();
    const orderDate = input.orderDate ?? today;
    if (orderDate > today) throw new StockRefusal(STOCK_CODES.orderDateInFuture, 'An order cannot be dated in the future.');
    await this.clock.assertDayOpen(orderDate);
    const { items, total } = await priceLines(this.master, input.lines);
    const order = await this.orders.create(
      { userId, outlet: input.outlet, orderDate, status: 'PLACED', totalAmountPaise: total, remarks: input.remarks, items, completedBy: null, completedAt: null, clientId, createdAt: this.clock.now(), createdBy, editedBy: null, editedAt: null },
      ctx,
    );
    return { serverId: order.id, totalAmountPaise: order.totalAmountPaise };
  }
}

/** Each line's amount and the order's total, worked out from quantity and unit price; every product must exist and be active. */
async function priceLines(master: FieldMasterDataPort, lines: PlaceOrderInput['lines']): Promise<{ items: OrderItem[]; total: Paise }> {
  const items: OrderItem[] = [];
  let total = 0;
  for (const l of lines) {
    const product = await master.getProduct(l.productId);
    if (!product || product.status !== 'active') throw new StockRefusal(STOCK_CODES.productNotFound, 'A product in the list does not exist or is no longer active.');
    const amountPaise = l.quantity * l.unitPricePaise;
    total += amountPaise;
    if (amountPaise > MAX_PAISE || total > MAX_PAISE) throw new StockRefusal(STOCK_CODES.amountTooLarge, 'The order’s amount is too large.');
    items.push({ productId: l.productId, quantity: l.quantity, unitPricePaise: l.unitPricePaise, amountPaise });
  }
  return { items, total };
}

/** Admin or the Accountant corrects a `PLACED` order's lines, prices and remarks before marking it done; employee, outlet and date stay. One conditional update, so a racing Done/Cancel wins cleanly and this is a 409. */
export class EditOrderUseCase {
  constructor(
    private readonly get: GetOrderUseCase,
    private readonly master: FieldMasterDataPort,
    private readonly orders: OrderRepositoryPort,
    private readonly clock: SalesClock,
  ) {}

  async execute(actor: Actor, id: string, input: Pick<PlaceOrderInput, 'lines' | 'remarks'>): Promise<Order> {
    if (!seesEveryOrder(actor)) throw new StockRefusal(STOCK_CODES.orderNotYours, 'Only Admin or the Accountant can change an order.');
    const order = await this.get.execute(actor, id);
    if (order.status !== 'PLACED') throw new StockRefusal(STOCK_CODES.orderNotPlaced, `The order is already ${order.status}.`);
    await this.clock.assertDayOpen(order.orderDate);
    const { items, total } = await priceLines(this.master, input.lines);
    if (!(await this.orders.update(id, { items, totalAmountPaise: total, remarks: input.remarks }, actor.id, this.clock.now()))) {
      const now = (await this.orders.findById(id))?.status ?? order.status;
      throw new StockRefusal(STOCK_CODES.orderNotPlaced, `The order is already ${now}.`);
    }
    return (await this.orders.findById(id)) ?? order;
  }
}

/** Admin and the Accountant (who marks orders dispatched) see and finish every order; an MR only their own. */
const seesEveryOrder = (actor: Actor): boolean => actor.role === 'ADMIN' || actor.role === 'ACCOUNTANT';

/** Who may see an order: its MR, their managers, Admin, the Accountant. */
async function visibleUserIds(users: UserDirectoryPort, actor: Actor): Promise<string[] | undefined> {
  return seesEveryOrder(actor) ? undefined : [actor.id, ...(await users.getDownline(actor.id)).map((u) => u.id)];
}

export class ListOrdersUseCase {
  constructor(
    private readonly orders: OrderRepositoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, filter: { status?: OrderStatus | undefined; from?: string | undefined; to?: string | undefined; outlet?: Outlet | undefined }): Promise<Order[]> {
    return this.orders.list({ ...filter, userIds: await visibleUserIds(this.users, actor) }, LIMIT);
  }
}

export class GetOrderUseCase {
  constructor(
    private readonly orders: OrderRepositoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(actor: Actor, id: string): Promise<Order> {
    const order = await this.orders.findById(id);
    const visible = await visibleUserIds(this.users, actor);
    // Not visible looks the same as not there.
    if (!order || (visible && !visible.includes(order.userId))) throw new StockRefusal(STOCK_CODES.orderNotFound, 'No such order.');
    return order;
  }
}

/** Distributor orders only (a chemist order is information, never marked). `PLACED` → `DONE` or `CANCELLED`, by the MR who placed it, an Admin or the Accountant; one conditional update, so of two racing calls exactly one wins and the other is a 409. */
export class FinishOrderUseCase {
  constructor(
    private readonly get: GetOrderUseCase,
    private readonly orders: OrderRepositoryPort,
    private readonly clock: SalesClock,
  ) {}

  async execute(actor: Actor, id: string, to: 'DONE' | 'CANCELLED'): Promise<Order> {
    const order = await this.get.execute(actor, id);
    if (order.outlet.type === 'CHEMIST') throw new StockRefusal(STOCK_CODES.orderInfoOnly, 'A chemist order is for information only; only a distributor order is marked done.');
    if (!seesEveryOrder(actor) && order.userId !== actor.id) throw new StockRefusal(STOCK_CODES.orderNotYours, 'Only the MR who placed the order can do that.');
    if (!(await this.orders.transition(id, to, actor.id, this.clock.now()))) {
      const now = (await this.orders.findById(id))?.status ?? order.status;
      throw new StockRefusal(STOCK_CODES.orderNotPlaced, `The order is already ${now}.`);
    }
    return (await this.orders.findById(id)) ?? order;
  }
}
