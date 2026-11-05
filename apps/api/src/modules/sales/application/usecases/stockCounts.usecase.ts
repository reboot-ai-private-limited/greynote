import type { ApprovalStatus } from '@/modules/approval/approval.public.js';
import type { StockCountDistributorDto, StockCountLineDto, StockCountStatus, StockCountsMonthDto } from '@greynote/contracts';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { TransactionContext, TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { logger } from '@/shared/logging/logger.js';
import { stockFigure } from '@/shared/stock/stockFigures.js';
import { monthRange } from '@/shared/time/businessTime.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { SalesApprovalsPort } from '../../domain/approvals.port.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import type { SecondaryRollupRepositoryPort } from '../../domain/secondaryRollup.repository.port.js';
import type { SecondaryStockLineRepositoryPort } from '../../domain/secondaryStockLine.repository.port.js';
import type { OrderRepositoryPort } from '../../domain/order.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { Actor } from '../outletAccess.js';
import { assertMayAct } from './employeeSales.usecase.js';
import type { SalesClock } from '../salesClock.js';

/** The kind of approval a month of an employee's distributor stock counts goes through; its record id is `userId:month`. */
export const STOCK_COUNT_KIND = 'STOCK_COUNT';
export const stockCountRecordId = (userId: string, month: string): string => `${userId}:${month}`;
/** A manager's month of secondary sales (their team's approved MR reports) is its own approval; its record id is `managerUserId:month`. */
export const SECONDARY_ROLLUP_KIND = 'SECONDARY_ROLLUP';
export const rollupRecordId = (userId: string, month: string): string => `${userId}:${month}`;

/**
 * The employee sends a finished month of distributor counts to their manager (Admin if none): every draft or rejected count they recorded becomes
 * pending and one approval request is started (or restarted after a rejection or withdrawal), in one transaction. Approving makes the counts count.
 */
export class SubmitStockCountsUseCase {
  constructor(
    private readonly stock: MonthlyStockRepositoryPort,
    private readonly approvals: SalesApprovalsPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
  ) {}

  async execute(actor: Actor, month: string): Promise<{ requestId: string; sent: number }> {
    if (month > (await this.clock.today()).slice(0, 7)) throw new StockRefusal(STOCK_CODES.monthNotStarted, `${month} has not started yet.`);
    await assertFinancialYearOpen(this.config, `${month}-01`, 'This month');
    return this.transactions.run(async (ctx) => {
      const sent = await this.stock.setStatus({ recordedBy: actor.id, month }, ['DRAFT', 'REJECTED'], 'PENDING', undefined, ctx);
      if (sent === 0) throw new StockRefusal(STOCK_CODES.secondaryNothingToSend, 'There are no distributor counts to send for this month.');
      const request = await this.approvals.submit({ kind: STOCK_COUNT_KIND, recordId: stockCountRecordId(actor.id, month), submitterId: actor.id }, ctx);
      return { requestId: request.id, sent };
    });
  }
}

/**
 * The approval's effect on the month's counts, inside the approval's own transaction. Approving fixes who each distributor's count counts toward:
 * the employee who recorded it and everyone the distributor is assigned to at that moment, so unassigning someone later changes no approved month.
 */
export function makeStockCountStatusHandler(stock: MonthlyStockRepositoryPort, master: Pick<FieldMasterDataPort, 'getDistributor'>): (change: { recordId: string; status: ApprovalStatus }, ctx: TransactionContext) => Promise<void> {
  return async ({ recordId, status }, ctx) => {
    const [userId, month] = recordId.split(':');
    if (!userId || !month) return;
    const who = { recordedBy: userId, month };
    if (status === 'APPROVED') {
      const distributors = [...new Set((await stock.listByRecorder(userId, month)).filter((r) => r.status === 'PENDING').map((r) => r.outlet.id))];
      for (const distributorId of distributors) {
        const assigned = (await master.getDistributor(distributorId))?.assignedUserIds ?? [];
        await stock.setStatus({ ...who, distributorId }, ['PENDING'], 'APPROVED', [...new Set([userId, ...assigned])], ctx);
      }
    } else if (status === 'REJECTED') await stock.setStatus(who, ['PENDING'], 'REJECTED', undefined, ctx);
    // Withdrawn, or reopened by Admin after approval: back to drafts the employee can change and send again.
    else if (status === 'WITHDRAWN' || status === 'REOPENED') await stock.setStatus(who, ['PENDING', 'APPROVED'], 'DRAFT', [], ctx);
  };
}

/**
 * Admin deletes one employee's distributor counts for a month and the approval request with its history, so the employee can count and send the
 * month again. Orders, Admin's statements and other employees' counts stay. The month must have started and its financial year be open; Admin has
 * no deadline. The old figures go to the log, as there is no audit table.
 */
export class DeleteStockCountsUseCase {
  constructor(
    private readonly stock: MonthlyStockRepositoryPort,
    private readonly approvals: SalesApprovalsPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
    private readonly lines?: SecondaryStockLineRepositoryPort,
    private readonly rollups?: SecondaryRollupRepositoryPort,
  ) {}

  /** What a delete would remove, for the confirmation. */
  async preview(actor: Actor, input: { userId: string; month: string }): Promise<{ distributors: number; lines: number; requestWaiting: boolean }> {
    if (actor.role !== 'ADMIN') throw new StockRefusal(STOCK_CODES.adminOnly, 'Only an Admin can delete a month of counts.');
    const rows = await this.stock.listByRecorder(input.userId, input.month);
    const mine = (await this.lines?.listByUser(input.userId, input.month)) ?? [];
    const request = await this.approvals.getForRecord(STOCK_COUNT_KIND, stockCountRecordId(input.userId, input.month));
    return { distributors: new Set([...rows.map((r) => r.outlet.id), ...mine.map((r) => r.distributorId)]).size, lines: rows.length + mine.length, requestWaiting: request?.status === 'SUBMITTED' || request?.status === 'MANAGER_APPROVED' };
  }

  async execute(actor: Actor, input: { userId: string; month: string }): Promise<{ distributors: number; lines: number; requestRemoved: boolean }> {
    if (actor.role !== 'ADMIN') throw new StockRefusal(STOCK_CODES.adminOnly, 'Only an Admin can delete a month of counts.');
    if (input.month > (await this.clock.today()).slice(0, 7)) throw new StockRefusal(STOCK_CODES.monthNotStarted, `${input.month} has not started yet.`);
    await assertFinancialYearOpen(this.config, `${input.month}-01`, 'This month');
    const recordId = stockCountRecordId(input.userId, input.month);
    const before = await this.stock.listByRecorder(input.userId, input.month);
    const beforeLines = (await this.lines?.listByUser(input.userId, input.month)) ?? [];
    const request = await this.approvals.getForRecord(STOCK_COUNT_KIND, recordId);
    await this.transactions.run(async (ctx) => {
      await this.stock.deleteByRecorder(input.userId, input.month, ctx);
      await this.lines?.deleteByUser(input.userId, input.month, ctx);
      if (request) await this.approvals.deleteForRecord(STOCK_COUNT_KIND, recordId, ctx);
      // A manager's own team report for the month goes with it, with its approval request.
      if (await this.rollups?.deleteByUser(input.userId, input.month, ctx)) await this.approvals.deleteForRecord(SECONDARY_ROLLUP_KIND, rollupRecordId(input.userId, input.month), ctx);
    });
    logger.info(
      { audit: 'stockcounts.deleted', by: actor.id, userId: input.userId, month: input.month, requestId: request?.id ?? null, requestStatus: request?.status ?? null, lines: before.map((r) => ({ distributorId: r.outlet.id, productId: r.productId, opening: r.openingQty, closing: r.closingQty, status: r.status })) },
      'an Admin deleted a month of distributor counts',
    );
    return { distributors: new Set([...before.map((r) => r.outlet.id), ...beforeLines.map((r) => r.distributorId)]).size, lines: before.length + beforeLines.length, requestRemoved: request !== null };
  }
}

/** Where a month stands from its distributors' statuses: anything unfinished first, so a month is only Approved when every distributor is. */
export function monthStatusOf(statuses: readonly StockCountStatus[]): StockCountsMonthDto['status'] {
  if (statuses.length === 0) return 'NOT_ENTERED';
  for (const s of ['REJECTED', 'DRAFT', 'PENDING'] as const) if (statuses.includes(s)) return s;
  return 'APPROVED';
}

/**
 * An employee's month of distributor counts, distributor by distributor, with what each count works out to: opening + Done deliveries − closing,
 * valued at PTS. The approval card reads it. Admin, the employee, or the manager above.
 */
export class ReadStockCountsUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly stock: MonthlyStockRepositoryPort,
    private readonly orders: OrderRepositoryPort,
    private readonly clock: SalesClock,
  ) {}

  async execute(actor: Actor, input: { userId: string; month: string }): Promise<StockCountsMonthDto> {
    await assertMayAct(this.users, actor, input.userId);
    const rows = await this.stock.listByRecorder(input.userId, input.month);
    const [products, timeZone, dayStart] = await Promise.all([this.master.listActiveProducts(), this.clock.timeZone(), this.clock.dayStart()]);
    const productOf = new Map(products.map((p) => [p.id, p]));
    const { from, to } = monthRange(input.month);
    const distributors: StockCountDistributorDto[] = [];
    for (const distributorId of [...new Set(rows.map((r) => r.outlet.id))]) {
      const mine = rows.filter((r) => r.outlet.id === distributorId);
      const sums = await this.orders.sumDistributorOrders({ from, to, timeZone, dayStart, distributorId });
      const delivered = new Map<string, number>();
      for (const s of sums) if (s.status === 'DONE' && s.month === input.month) delivered.set(s.productId, (delivered.get(s.productId) ?? 0) + s.quantity);
      const lines = mine
        .flatMap((r): StockCountLineDto[] => {
          const p = productOf.get(r.productId);
          if (!p) return [];
          const figure = stockFigure({ orderQty: delivered.get(r.productId) ?? 0, count: { openingQty: r.openingQty, closingQty: r.closingQty } });
          return [{ product: { id: p.id, name: p.name, sku: p.sku }, openingQty: r.openingQty, closingQty: r.closingQty, deliveredQty: figure.orderPrimaryQty, secondaryQty: figure.secondaryQty, secondaryAmountPaise: figure.secondaryQty !== null && p.ptsPaise ? figure.secondaryQty * p.ptsPaise : null }];
        })
        .sort((a, b) => a.product.name.localeCompare(b.product.name));
      distributors.push({ distributorId, name: (await this.master.getDistributor(distributorId))?.name ?? '(removed)', status: monthStatusOf(mine.map((r) => r.status ?? 'APPROVED')) as StockCountStatus, lines });
    }
    distributors.sort((a, b) => a.name.localeCompare(b.name));
    return { userId: input.userId, month: input.month, status: monthStatusOf(distributors.map((d) => d.status)), distributors };
  }
}
