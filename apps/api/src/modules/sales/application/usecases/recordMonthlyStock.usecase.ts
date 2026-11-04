import { parseBoolean, readConfigOr, type ConfigReader } from '@/shared/config/readConfig.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { SalesLateGate } from '../../domain/salesLateGate.port.js';
import { monthWindow } from '../../domain/stockDeadline.js';
import type { Outlet, StockLine, StockStatus } from '../../domain/monthlyStock.entity.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { Actor, OutletAccess } from '../outletAccess.js';
import type { SalesClock } from '../salesClock.js';

export interface RecordStockInput {
  outlet: Outlet;
  month: string;
  lines: StockLine[];
}

/**
 * An outlet's opening and closing counts for a month (LLD sales-and-orders.md, *Monthly stock*): an MR for the
 * Chemists and Distributors on their Routes, Admin for any. Due by the month's last day (plus grace); after that
 * only an Admin, or a month an Admin has unlocked, takes entries. A second entry for the same outlet, product and
 * month overwrites — which is also what makes a replayed sync record harmless.
 */
export class RecordMonthlyStockUseCase {
  constructor(
    private readonly access: OutletAccess,
    private readonly master: FieldMasterDataPort,
    private readonly stock: MonthlyStockRepositoryPort,
    private readonly clock: SalesClock,
    private readonly config?: ConfigReader,
    private readonly late?: SalesLateGate,
  ) {}

  async execute(actor: Actor, input: RecordStockInput, ctx?: TransactionContext): Promise<{ serverId: string; lines: number }> {
    const { outlet, month } = input;
    await this.access.assertUsable(actor, outlet);

    const now = this.clock.now();
    const window = monthWindow(month, now, await this.clock.deadlineDay(), await this.clock.timeZone(), await this.clock.dayStart());
    if (window === 'FUTURE') throw new StockRefusal(STOCK_CODES.monthNotStarted, `${month} has not started yet.`);
    if (window === 'CLOSED' && actor.role !== 'ADMIN' && !(await this.stock.isUnlocked(month)) && !(await this.late?.hasUsable(actor.id, 'MONTHLY_STOCK', month))) {
      throw new StockRefusal(STOCK_CODES.monthClosed, `The deadline for ${month} has passed. Ask an Admin to reopen it.`);
    }

    // The financial year the month belongs to must be open (decision-log 2026-10-06); a closed year takes no new counts.
    if (this.config) await assertFinancialYearOpen(this.config, `${month}-01`, 'This month');

    for (const line of input.lines) {
      const product = await this.master.getProduct(line.productId);
      if (!product || product.status !== 'active') throw new StockRefusal(STOCK_CODES.productNotFound, 'A product in the list does not exist or is no longer active.');
    }

    // With approval on, an employee's own distributor count is a draft until they submit the month; Admin's is final. A month already sent or
    // approved is locked to the employee (a withdrawal or rejection opens it again). Chemist counts are never approved.
    let status: StockStatus | undefined;
    if (outlet.type === 'DISTRIBUTOR' && (await stockApprovalOn(this.config))) {
      status = actor.role === 'ADMIN' ? 'APPROVED' : 'DRAFT';
      if (actor.role !== 'ADMIN') {
        const held = (await this.stock.list({ month, outlets: [outlet] }, 5000)).find((r) => input.lines.some((l) => l.productId === r.productId) && (r.status === 'PENDING' || r.status === 'APPROVED'));
        if (held) throw new StockRefusal(STOCK_CODES.secondaryLocked, `This month is ${held.status === 'PENDING' ? 'waiting for approval' : 'approved'}. Withdraw it, or ask your manager to reopen it, before changing it.`);
      }
    }

    await this.stock.upsertMany(outlet, month, input.lines, actor.id, now, ctx, status);
    return { serverId: `${outlet.id}:${month}`, lines: input.lines.length };
  }
}

/** Whether distributor counts go through approval (Admin setting `STOCK_COUNT_APPROVAL`, off until the field app can submit). A config not seeded yet reads as off. */
export async function stockApprovalOn(config: ConfigReader | undefined): Promise<boolean> {
  return config ? readConfigOr(config, 'STOCK_COUNT_APPROVAL', parseBoolean, false) : false;
}
