import type { ApprovalStatus } from '@/modules/approval/approval.public.js';
import type { EmployeeSalesDto, EmployeeSalesLineDto } from '@greynote/contracts';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { monthRange } from '@/shared/time/businessTime.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { SecondaryStatus } from '../../domain/employeeSale.entity.js';
import type { EmployeeSaleRepositoryPort } from '../../domain/employeeSale.repository.port.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import type { OrderRepositoryPort } from '../../domain/order.repository.port.js';
import { monthWindow } from '../../domain/stockDeadline.js';
import type { SalesLateGate } from '../../domain/salesLateGate.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { SalesApprovalsPort } from '../../domain/approvals.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../outletAccess.js';
import type { SecondaryAttachmentRepositoryPort } from '../../domain/secondaryAttachment.repository.port.js';
import type { SecondaryFileStoragePort } from '../../domain/proofStorage.port.js';
import { logger } from '@/shared/logging/logger.js';
import type { SalesClock } from '../salesClock.js';
import { stockApprovalOn } from './recordMonthlyStock.usecase.js';

const UNKNOWN = '(removed)';
const MAX_QTY = 100_000_000;

/**
 * Whose figures the actor may touch: Admin anyone's; a field employee their own and, as a manager, their downline's. The subject must be an
 * active field employee.
 */
export async function assertMayAct(users: UserDirectoryPort, actor: Actor, userId: string): Promise<void> {
  const [subject] = await users.getUserSummaries([userId]);
  if (!subject || subject.status !== 'active' || subject.role !== 'FIELD') throw new StockRefusal(STOCK_CODES.employeeNotFound, 'That employee does not exist or is not an active field employee.');
  if (actor.role === 'ADMIN' || actor.id === userId) return;
  const downline = actor.role === 'FIELD' ? await users.getDownline(actor.id) : [];
  if (!downline.some((u) => u.id === userId)) throw new StockRefusal(STOCK_CODES.notYourTeam, 'You can only work with your own figures and your team\'s.');
}

/**
 * The month must have started, its financial year be open, and (for anyone but Admin) its stock deadline not have passed unless Admin reopened
 * it. The one window every entry of a month's secondary obeys: the figures and their files.
 */
export async function assertMonthOpenForEntry(deps: { clock: SalesClock; stock: MonthlyStockRepositoryPort; config: ConfigReader; late?: SalesLateGate | undefined }, actor: Actor, month: string, subjectUserId: string): Promise<void> {
  const window = monthWindow(month, deps.clock.now(), await deps.clock.deadlineDay(), await deps.clock.timeZone(), await deps.clock.dayStart());
  if (window === 'FUTURE') throw new StockRefusal(STOCK_CODES.monthNotStarted, `${month} has not started yet.`);
  if (window === 'CLOSED' && actor.role !== 'ADMIN' && !(await deps.stock.isUnlocked(month)) && !(await deps.late?.hasUsable(subjectUserId, 'SECONDARY_SALES', month))) {
    throw new StockRefusal(STOCK_CODES.monthClosed, `The deadline for ${month} has passed. Ask an Admin to reopen it.`);
  }
  await assertFinancialYearOpen(deps.config, `${month}-01`, 'This month');
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
    private readonly late?: SalesLateGate,
  ) {}

  async execute(actor: Actor, input: { userId: string; month: string; lines: Array<{ productId: string; qty?: number | undefined; amountPaise?: number | undefined }> }): Promise<{ added: number; changed: number }> {
    if (await stockApprovalOn(this.config)) throw new StockRefusal(STOCK_CODES.secondaryRetired, 'The per-product secondary is retired. Count the distributor stock and submit that month instead.');
    await assertMayAct(this.users, actor, input.userId);
    const now = this.clock.now();
    await assertMonthOpenForEntry({ clock: this.clock, stock: this.stock, config: this.config, late: this.late }, actor, input.month, input.userId);
    const products = new Map((await this.master.listActiveProducts()).map((p) => [p.id, p]));
    const lines = input.lines.map((l) => {
      const product = products.get(l.productId);
      if (!product) throw new StockRefusal(STOCK_CODES.productNotFound, 'A product in the list does not exist or is no longer active.');
      return { productId: l.productId, ...linkQtyAndAmount(l, product.ptsPaise) };
    });
    await assertWhole(this.master, [], lines.map((l) => l.qty), 0);
    const own = actor.id === input.userId;
    if (own) {
      // Once sent, the month waits for its manager; once approved it only a manager or Admin changes (or reopens through the approval).
      const locked = (await this.sales.list({ userIds: [input.userId], fromMonth: input.month, toMonth: input.month }, 5000)).filter((r) => lines.some((l) => l.productId === r.productId) && r.secondaryQty !== null && (r.secondaryStatus === 'PENDING' || r.secondaryStatus === 'APPROVED'));
      if (locked.length > 0) throw new StockRefusal(STOCK_CODES.secondaryLocked, `This month is ${locked[0]!.secondaryStatus === 'PENDING' ? 'waiting for approval' : 'approved'}. Withdraw it, or ask your manager to reopen it, before changing it.`);
    }
    // The employee's own entry is a draft until sent; a manager's or Admin's is the approver's own word.
    return this.sales.setSecondary(input.userId, input.month, lines, own ? 'DRAFT' : 'APPROVED', actor.id, now);
  }
}

/** Units and amount are one figure at the product's PTS: give either, get both. An amount is rounded to whole units and restated from them. */
export function linkQtyAndAmount(entry: { qty?: number | undefined; amountPaise?: number | undefined }, ptsPaise: number | null): { qty: number; amountPaise: number | null } {
  if (entry.qty !== undefined) return { qty: entry.qty, amountPaise: ptsPaise ? entry.qty * ptsPaise : null };
  if (!ptsPaise) throw new StockRefusal(STOCK_CODES.secondaryNeedsPtr, 'This product has no PTS set, so give units rather than an amount.');
  const qty = Math.round((entry.amountPaise ?? 0) / ptsPaise);
  return { qty, amountPaise: qty * ptsPaise };
}

/** The kind of approval a month's secondary goes through; its record id is `userId:month`. */
export const SECONDARY_SALES_KIND = 'SECONDARY_SALES';
export const secondaryRecordId = (userId: string, month: string): string => `${userId}:${month}`;

/**
 * The employee sends a finished month's secondary to their manager (Admin if none): every DRAFT or REJECTED line becomes PENDING and an approval
 * request is started (or restarted after a rejection or withdrawal), in one transaction. Approving makes the lines count toward achievement.
 */
export class SubmitEmployeeSecondaryUseCase {
  constructor(
    private readonly sales: EmployeeSaleRepositoryPort,
    private readonly approvals: SalesApprovalsPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
  ) {}

  async execute(actor: Actor, month: string): Promise<{ requestId: string; sent: number }> {
    if (await stockApprovalOn(this.config)) throw new StockRefusal(STOCK_CODES.secondaryRetired, 'The per-product secondary is retired. Count the distributor stock and submit that month instead.');
    if (month > (await this.clock.today()).slice(0, 7)) throw new StockRefusal(STOCK_CODES.monthNotStarted, `${month} has not started yet.`);
    await assertFinancialYearOpen(this.config, `${month}-01`, 'This month');
    return this.transactions.run(async (ctx) => {
      const sent = await this.sales.setSecondaryStatus(actor.id, month, ['DRAFT', 'REJECTED'], 'PENDING', ctx);
      if (sent === 0) throw new StockRefusal(STOCK_CODES.secondaryNothingToSend, 'There is no secondary to send for this month.');
      const request = await this.approvals.submit({ kind: SECONDARY_SALES_KIND, recordId: secondaryRecordId(actor.id, month), submitterId: actor.id }, ctx);
      return { requestId: request.id, sent };
    });
  }
}

/**
 * Admin deletes a month's secondary for an employee: every line's units, amount and status, the approval request (with its history) and the month's
 * files (the stored files too). Admin's primary change on a line stays. No deadline for Admin, but the month must have started and its financial year
 * be open. Deleting a month with nothing in it is not an error. The old figures are written to the log, as there is no audit table.
 */
export class DeleteEmployeeSecondaryUseCase {
  constructor(
    private readonly d: {
      users: UserDirectoryPort;
      sales: EmployeeSaleRepositoryPort;
      stock: MonthlyStockRepositoryPort;
      files: SecondaryAttachmentRepositoryPort;
      storage: SecondaryFileStoragePort;
      approvals: SalesApprovalsPort;
      transactions: TransactionRunnerPort;
      clock: SalesClock;
      config: ConfigReader;
      late?: SalesLateGate | undefined;
    },
  ) {}

  async execute(actor: Actor, input: { userId: string; month: string }): Promise<{ lines: number; files: number; requestRemoved: boolean }> {
    if (actor.role !== 'ADMIN') throw new StockRefusal(STOCK_CODES.adminOnly, 'Only an Admin can delete a month\'s secondary.');
    await assertMayAct(this.d.users, actor, input.userId);
    await assertMonthOpenForEntry(this.d, actor, input.month, input.userId);

    const recordId = secondaryRecordId(input.userId, input.month);
    const before = (await this.d.sales.list({ userIds: [input.userId], fromMonth: input.month, toMonth: input.month }, 5000)).filter((r) => r.secondaryQty !== null);
    const files = await this.d.files.list(input.userId, input.month);
    const request = await this.d.approvals.getForRecord(SECONDARY_SALES_KIND, recordId);

    await this.d.transactions.run(async (ctx) => {
      await this.d.sales.clearSecondary(input.userId, input.month, actor.id, this.d.clock.now(), ctx);
      if (request) await this.d.approvals.deleteForRecord(SECONDARY_SALES_KIND, recordId, ctx);
    });
    // The files go after the figures: a failure here leaves a file with no figures, which Admin can delete again, never figures that lost their proof.
    for (const f of files) {
      await this.d.files.remove(f.id);
      await this.d.storage.remove(f.publicId).catch((e: unknown) => logger.error({ err: e, publicId: f.publicId }, 'could not remove a secondary file from storage'));
    }

    logger.info(
      { audit: 'secondary.deleted', by: actor.id, userId: input.userId, month: input.month, requestId: request?.id ?? null, requestStatus: request?.status ?? null, lines: before.map((r) => ({ productId: r.productId, qty: r.secondaryQty, status: r.secondaryStatus })), files: files.map((f) => f.fileName) },
      'an Admin deleted a month\'s secondary',
    );
    return { lines: before.length, files: files.length, requestRemoved: request !== null };
  }
}

/** The approval's effect on the month's lines, inside the approval's own transaction. */
export function makeSecondaryStatusHandler(sales: EmployeeSaleRepositoryPort): (change: { recordId: string; status: ApprovalStatus }, ctx: TransactionContext) => Promise<void> {
  return async ({ recordId, status }, ctx) => {
    const [userId, month] = recordId.split(':');
    if (!userId || !month) return;
    if (status === 'APPROVED') await sales.setSecondaryStatus(userId, month, ['PENDING'], 'APPROVED', ctx);
    else if (status === 'REJECTED') await sales.setSecondaryStatus(userId, month, ['PENDING'], 'REJECTED', ctx);
    // Withdrawn, or reopened by Admin after approval: back to a draft the employee can change and send again.
    else if (status === 'WITHDRAWN' || status === 'REOPENED') await sales.setSecondaryStatus(userId, month, ['PENDING', 'APPROVED'], 'DRAFT', ctx);
  };
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
    private readonly approvals?: SalesApprovalsPort,
    private readonly attachments?: SecondaryAttachmentRepositoryPort,
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
          // Restated at today's PTS from the units, so entries saved before the switch from PTR read the same as new ones.
          secondaryAmountPaise: s?.secondaryQty != null && p.ptsPaise ? s.secondaryQty * p.ptsPaise : null,
          ptsPaise: p.ptsPaise,
          ptrPaise: p.ptrPaise,
          secondaryStatus: s && s.secondaryQty !== null ? s.secondaryStatus : null,
          updatedBy: s ? { id: s.updatedBy, name: people.find((u) => u.id === s.updatedBy)?.name ?? UNKNOWN } : null,
          updatedAt: s ? s.updatedAt.toISOString() : null,
        };
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
    const order: SecondaryStatus[] = ['PENDING', 'REJECTED', 'DRAFT', 'APPROVED'];
    const entered = lines.flatMap((l) => (l.secondaryStatus ? [l.secondaryStatus] : []));
    const secondaryStatus = order.find((st) => entered.includes(st)) ?? null;
    const request = this.approvals ? await this.approvals.getForRecord(SECONDARY_SALES_KIND, secondaryRecordId(input.userId, input.month)) : null;
    const files = this.attachments ? await this.attachments.list(input.userId, input.month) : [];
    const attachments = files.map((f) => ({ id: f.id, url: f.url, fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, uploadedBy: f.uploadedBy, uploadedAt: f.uploadedAt.toISOString() }));
    return { userId: input.userId, month: input.month, secondaryStatus, approvalRequestId: request?.id ?? null, lines, attachments };
  }
}
