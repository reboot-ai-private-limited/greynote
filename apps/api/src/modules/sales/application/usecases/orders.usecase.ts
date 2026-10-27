import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { MAX_PAISE, type Paise } from '@/shared/money/paise.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { Outlet } from '../../domain/monthlyStock.entity.js';
import { netOf, type Order, type OrderItem, type OrderStatus } from '../../domain/order.entity.js';
import { netLines, suppliedNet, type Discount } from '../../domain/orderDiscount.js';
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
  /** `freeQty`: units to be given free on top (the office sets it; an employee's own order never carries any). */
  lines: Array<{ productId: string; quantity: number; unitPricePaise: Paise; freeQty?: number | undefined; discount?: Discount | null | undefined }>;
  /** Discount on the whole order. Like the line discounts, only the office gives it, and only on a distributor order. */
  discount?: Discount | null | undefined;
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
    // An employee's own order never carries free units: those are the office's to give.
    return this.write(actor.id, null, { ...input, discount: null, lines: input.lines.map((l) => ({ ...l, freeQty: 0, discount: null })) }, clientId, ctx, true);
  }

  /** Admin or the Accountant adds an order for a field employee, credited to that employee; the outlet need not be on their Routes. */
  async executeFor(office: Actor, employeeId: string, input: PlaceOrderInput): Promise<{ serverId: string; totalAmountPaise: Paise }> {
    const [employee] = await this.users.getUserSummaries([employeeId]);
    if (!employee || employee.role !== 'FIELD' || employee.status !== 'active') throw new StockRefusal(STOCK_CODES.employeeNotFound, 'That is not an active field employee.');
    await this.access.assertUsable(office, input.outlet);
    return this.write(employeeId, office.id, input, null);
  }

  private async write(userId: string, createdBy: string | null, input: PlaceOrderInput, clientId: string | null, ctx?: TransactionContext, catalogPrice = false): Promise<{ serverId: string; totalAmountPaise: Paise }> {
    const today = await this.clock.today();
    const orderDate = input.orderDate ?? today;
    if (orderDate > today) throw new StockRefusal(STOCK_CODES.orderDateInFuture, 'An order cannot be dated in the future.');
    await this.clock.assertDayOpen(orderDate);
    const { items, total, discount, orderDiscountPaise } = await priceLines(this.master, input.outlet, input.lines, input.discount, catalogPrice);
    const order = await this.orders.create(
      { userId, outlet: input.outlet, orderDate, status: 'PLACED', totalAmountPaise: total, discount, orderDiscountPaise, remarks: input.remarks, items, completedBy: null, completedAt: null, clientId, createdAt: this.clock.now(), createdBy, editedBy: null, editedAt: null },
      ctx,
    );
    return { serverId: order.id, totalAmountPaise: order.totalAmountPaise };
  }
}

/**
 * Each line's gross amount and net (after its own discount and its share of the order discount), and the order's total (the sum of the nets).
 * Every product must exist and be active. Discounts are for distributor orders only (a chemist order is information, never billed).
 * `catalogPrice` (an MR's own order): the unit price is the product's PTS for a distributor, PTR for a chemist, whatever the phone sent, because a phone
 * with a stale catalogue falls back to the MRP; a product with no such price keeps the phone's. The office's own orders and edits keep the price they type.
 */
async function priceLines(master: FieldMasterDataPort, outlet: Outlet, lines: PlaceOrderInput['lines'], orderDiscount: Discount | null | undefined, catalogPrice = false): Promise<{ items: OrderItem[]; total: Paise; discount: Discount | null; orderDiscountPaise: Paise }> {
  if (outlet.type === 'CHEMIST' && (orderDiscount || lines.some((l) => l.discount))) throw new StockRefusal(STOCK_CODES.invalidPayload, 'A discount can only be given on a distributor order.');
  let gross = 0;
  const priced: Array<{ line: PlaceOrderInput['lines'][number]; unitPricePaise: Paise; amountPaise: Paise }> = [];
  for (const l of lines) {
    const product = await master.getProduct(l.productId);
    if (!product || product.status !== 'active') throw new StockRefusal(STOCK_CODES.productNotFound, 'A product in the list does not exist or is no longer active.');
    const listed = outlet.type === 'DISTRIBUTOR' ? product.ptsPaise : product.ptrPaise;
    const unitPricePaise = catalogPrice && listed ? listed : l.unitPricePaise;
    const amountPaise = l.quantity * unitPricePaise;
    gross += amountPaise;
    if (amountPaise > MAX_PAISE || gross > MAX_PAISE) throw new StockRefusal(STOCK_CODES.amountTooLarge, 'The order’s amount is too large.');
    if (l.discount?.type === 'FIXED' && l.discount.amountPaise > amountPaise) throw new StockRefusal(STOCK_CODES.invalidPayload, 'A flat discount on a line cannot be more than the line’s amount.');
    priced.push({ line: l, unitPricePaise, amountPaise });
  }
  const net = netLines(priced.map((p) => ({ grossPaise: p.amountPaise, lineDiscount: p.line.discount ?? null })), orderDiscount);
  const subtotal = net.netTotalPaise + net.orderDiscountPaise;
  if (orderDiscount?.type === 'FIXED' && orderDiscount.amountPaise > subtotal) throw new StockRefusal(STOCK_CODES.invalidPayload, 'A flat discount on the order cannot be more than the order’s amount after line discounts.');
  const items = priced.map(({ line, unitPricePaise, amountPaise }, i): OrderItem => ({
    productId: line.productId,
    quantity: line.quantity,
    unitPricePaise,
    amountPaise,
    suppliedQty: null,
    freeQty: line.freeQty ?? 0,
    discount: line.discount ?? null,
    netAmountPaise: net.lines[i]!.netPaise,
  }));
  return { items, total: net.netTotalPaise, discount: orderDiscount ?? null, orderDiscountPaise: net.orderDiscountPaise };
}

/** Admin or the Accountant corrects a `PLACED` order's lines, prices and remarks before marking it done; employee, outlet and date stay. One conditional update, so a racing Done/Cancel wins cleanly and this is a 409. */
export class EditOrderUseCase {
  constructor(
    private readonly get: GetOrderUseCase,
    private readonly master: FieldMasterDataPort,
    private readonly orders: OrderRepositoryPort,
    private readonly clock: SalesClock,
  ) {}

  async execute(actor: Actor, id: string, input: Pick<PlaceOrderInput, 'lines' | 'remarks' | 'discount'>): Promise<Order> {
    if (!seesEveryOrder(actor)) throw new StockRefusal(STOCK_CODES.orderNotYours, 'Only Admin or the Accountant can change an order.');
    const order = await this.get.execute(actor, id);
    if (order.status !== 'PLACED') throw new StockRefusal(STOCK_CODES.orderNotPlaced, `The order is already ${order.status}.`);
    await this.clock.assertDayOpen(order.orderDate);
    const { items, total, discount, orderDiscountPaise } = await priceLines(this.master, order.outlet, input.lines, input.discount);
    // The first change keeps what the employee ordered, so it is never lost to later edits.
    const original = order.originalItems ? undefined : { items: order.items, totalAmountPaise: order.totalAmountPaise };
    if (!(await this.orders.update(id, { items, totalAmountPaise: total, discount, orderDiscountPaise, remarks: input.remarks, ...(original && { original }) }, actor.id, this.clock.now(), order.editedAt ?? null))) {
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

export interface SupplyLine {
  productId: string;
  /** Position of the line on the order (0-based). Needed when the product is on more than one line; otherwise the product finds its line. */
  line?: number | undefined;
  /** Units supplied of what was ordered, `0 ≤ suppliedQty ≤ ordered`. */
  suppliedQty: number;
  /** Units given on top, free of charge. */
  freeQty: number;
}

/**
 * Distributor orders only (a chemist order is information, never marked). `PLACED` → `DONE` or `CANCELLED`, by the MR who placed it, an Admin or the
 * Accountant; one conditional update, so of two racing calls exactly one wins and the other is a 409.
 *
 * Marking Done records what was actually delivered: by default every line in full (what was ordered), or, when Admin or the Accountant send `supply`,
 * per line the units supplied and the free units on top. The ordered lines and total are never rewritten; primary counts what was supplied at the order's prices, after discounts
 * (free units are stock and secondary, never rupees). An MR marking their own order done cannot change the supply.
 */
export class FinishOrderUseCase {
  constructor(
    private readonly get: GetOrderUseCase,
    private readonly orders: OrderRepositoryPort,
    private readonly clock: SalesClock,
  ) {}

  async execute(actor: Actor, id: string, to: 'DONE' | 'CANCELLED', supply?: readonly SupplyLine[]): Promise<Order> {
    const order = await this.get.execute(actor, id);
    if (order.outlet.type === 'CHEMIST') throw new StockRefusal(STOCK_CODES.orderInfoOnly, 'A chemist order is for information only; only a distributor order is marked done.');
    if (!seesEveryOrder(actor) && order.userId !== actor.id) throw new StockRefusal(STOCK_CODES.orderNotYours, 'Only the MR who placed the order can do that.');
    if (supply && (to !== 'DONE' || !seesEveryOrder(actor))) throw new StockRefusal(STOCK_CODES.orderNotYours, 'Only Admin or the Accountant can record what was supplied.');
    const moved = to === 'CANCELLED' ? await this.orders.transition(id, to, actor.id, this.clock.now()) : await this.complete(order, actor, supply);
    if (!moved) {
      const now = (await this.orders.findById(id))?.status ?? order.status;
      throw new StockRefusal(STOCK_CODES.orderNotPlaced, `The order is already ${now}.`);
    }
    return (await this.orders.findById(id)) ?? order;
  }

  private complete(order: Order, actor: Actor, supply?: readonly SupplyLine[]): Promise<boolean> {
    // A supply entry names its line by position, or by product when that product is on one line only.
    const given = new Map<number, SupplyLine>();
    for (const l of supply ?? []) {
      const at = l.line ?? this.lineOf(order, l.productId);
      const line = order.items[at];
      if (!line || line.productId !== l.productId) throw new StockRefusal(STOCK_CODES.productNotFound, 'A product in the list is not on this order.');
      if (given.has(at)) throw new StockRefusal(STOCK_CODES.invalidPayload, 'A line appears twice.');
      if (!Number.isInteger(l.suppliedQty) || !Number.isInteger(l.freeQty) || l.suppliedQty < 0 || l.freeQty < 0 || l.suppliedQty > line.quantity) {
        throw new StockRefusal(STOCK_CODES.invalidPayload, 'Supplied must be a whole number from 0 up to what was ordered; free units a whole number, 0 or more.');
      }
      given.set(at, l);
    }
    const items = order.items.map((i, at) => {
      const l = given.get(at);
      // A line not named is delivered in full, with the free units the office planned for it when it changed the order.
      const suppliedQty = l ? l.suppliedQty : i.quantity;
      // What was delivered costs the line's net for those units: a flat discount shrinks with the supply.
      return { ...i, suppliedQty, freeQty: l ? l.freeQty : (i.freeQty ?? 0), suppliedNetPaise: suppliedNet(netOf(i), i.quantity, suppliedQty) };
    });
    const suppliedAmountPaise = items.reduce((n, i) => n + (i.suppliedNetPaise ?? 0), 0);
    return this.orders.complete(order.id, { items, suppliedAmountPaise, ifEditedAt: order.editedAt ?? null }, actor.id, this.clock.now());
  }

  /** Where a product sits on the order; refuses when it is on several lines, so the caller must say which. */
  private lineOf(order: Order, productId: string): number {
    const at = order.items.flatMap((i, n) => (i.productId === productId ? [n] : []));
    if (at.length > 1) throw new StockRefusal(STOCK_CODES.invalidPayload, 'That product is on more than one line; say which line (its position on the order).');
    return at[0] ?? -1;
  }
}
