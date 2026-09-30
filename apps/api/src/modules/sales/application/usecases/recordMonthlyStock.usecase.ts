import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { monthWindow } from '../../domain/stockDeadline.js';
import type { Outlet, StockLine } from '../../domain/monthlyStock.entity.js';
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
  ) {}

  async execute(actor: Actor, input: RecordStockInput, ctx?: TransactionContext): Promise<{ serverId: string; lines: number }> {
    const { outlet, month } = input;
    await this.access.assertUsable(actor, outlet);

    const now = this.clock.now();
    const window = monthWindow(month, now, await this.clock.graceDays(), await this.clock.timeZone());
    if (window === 'FUTURE') throw new StockRefusal(STOCK_CODES.monthNotStarted, `${month} has not started yet.`);
    if (window === 'CLOSED' && actor.role !== 'ADMIN' && !(await this.stock.isUnlocked(month))) {
      throw new StockRefusal(STOCK_CODES.monthClosed, `The deadline for ${month} has passed. Ask an Admin to reopen it.`);
    }

    for (const line of input.lines) {
      const product = await this.master.getProduct(line.productId);
      if (!product || product.status !== 'active') throw new StockRefusal(STOCK_CODES.productNotFound, 'A product in the list does not exist or is no longer active.');
    }

    await this.stock.upsertMany(outlet, month, input.lines, actor.id, now, ctx);
    return { serverId: `${outlet.id}:${month}`, lines: input.lines.length };
  }
}
