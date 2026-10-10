import type { DistributorStatementDto, StatementFlag, StatementLineDto } from '@greynote/contracts';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { stockFigure, previousMonthOf, type CountFigure, type StatementFigure } from '@/shared/stock/stockFigures.js';
import { assertFinancialYearOpen } from '@/shared/time/financialYearClose.js';
import { monthRange } from '@/shared/time/businessTime.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { MonthlyStock } from '../../domain/monthlyStock.entity.js';
import type { MonthlyStockRepositoryPort } from '../../domain/monthlyStock.repository.port.js';
import type { DistributorOrderSum, OrderRepositoryPort } from '../../domain/order.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { StatementLine, StockStatement } from '../../domain/stockStatement.entity.js';
import type { StockStatementRepositoryPort } from '../../domain/stockStatement.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../outletAccess.js';
import type { SalesClock } from '../salesClock.js';

const UNKNOWN = '(removed)';
const LIMIT = 20000;
/** A statement line is whole units; this is only a guard against a typo like an extra zero string. */
const MAX_QTY = 100_000_000;

export interface SaveStatementInput {
  distributorId: string;
  month: string;
  lines: Array<{ productId: string; openingQty: number; secondaryQty: number | null; adjustmentQty: number; reason?: string | null | undefined }>;
}

/**
 * Admin's monthly statement for one distributor: opening, the secondary the distributor reported, and an adjustment to primary with its reason
 * (decision-log 2026-10-09). The distributor must be active, the month must have started, its financial year must be open and every product must
 * be active; an adjustment needs a reason. There is no deadline for Admin: any past month can be entered or corrected, and each change keeps the
 * old values in the line's history.
 */
export class SaveStatementUseCase {
  constructor(
    private readonly master: FieldMasterDataPort,
    private readonly statements: StockStatementRepositoryPort,
    private readonly clock: SalesClock,
    private readonly config: ConfigReader,
  ) {}

  async execute(actor: Actor, input: SaveStatementInput): Promise<{ added: number; changed: number }> {
    const distributor = await this.master.getDistributor(input.distributorId);
    if (!distributor || distributor.status !== 'active') throw new StockRefusal(STOCK_CODES.outletNotFound, 'That distributor does not exist or is no longer active.');
    const today = await this.clock.today();
    if (input.month > today.slice(0, 7)) throw new StockRefusal(STOCK_CODES.monthNotStarted, `${input.month} has not started yet.`);
    await assertFinancialYearOpen(this.config, `${input.month}-01`, 'This month');

    const lines: StatementLine[] = [];
    for (const l of input.lines) {
      const product = await this.master.getProduct(l.productId);
      if (!product || product.status !== 'active') throw new StockRefusal(STOCK_CODES.productNotFound, 'A product in the list does not exist or is no longer active.');
      const reason = l.reason?.trim() || null;
      if (l.adjustmentQty !== 0 && !reason) throw new StockRefusal(STOCK_CODES.adjustmentNeedsReason, `Say why ${product.name} is adjusted.`);
      for (const n of [l.openingQty, l.adjustmentQty, ...(l.secondaryQty === null ? [] : [l.secondaryQty])]) {
        if (!Number.isInteger(n) || Math.abs(n) > MAX_QTY) throw new StockRefusal(STOCK_CODES.invalidPayload, 'Quantities are whole units.');
      }
      lines.push({ productId: l.productId, openingQty: l.openingQty, secondaryQty: l.secondaryQty, adjustmentQty: l.adjustmentQty, reason: l.adjustmentQty === 0 ? null : reason });
    }
    return this.statements.upsertMany(input.distributorId, input.month, lines, actor.id, this.clock.now());
  }
}

const key = (productId: string) => productId;

/** What a month's Done orders came to per product for one distributor, from the month-grouped order sums. */
function doneByProduct(sums: readonly DistributorOrderSum[], month: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sums) if (s.status === 'DONE' && s.month === month) out.set(key(s.productId), (out.get(key(s.productId)) ?? 0) + s.quantity);
  return out;
}

const countFigure = (c: MonthlyStock | undefined): CountFigure | undefined => (c ? { openingQty: c.openingQty, closingQty: c.closingQty } : undefined);
const statementFigure = (s: StockStatement | undefined): StatementFigure | undefined => (s ? { openingQty: s.openingQty, secondaryQty: s.secondaryQty, adjustmentQty: s.adjustmentQty } : undefined);

/**
 * The grid for one distributor and month: every active product with the field worker's count, the orders, Admin's saved statement (or a suggested
 * opening: last month's closing, else the field count's) and the figures that follow. Reads only.
 */
export class ReadStatementUseCase {
  constructor(
    private readonly master: FieldMasterDataPort,
    private readonly statements: StockStatementRepositoryPort,
    private readonly stock: MonthlyStockRepositoryPort,
    private readonly orders: OrderRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly clock: SalesClock,
  ) {}

  async execute(input: { distributorId: string; month: string }): Promise<DistributorStatementDto> {
    if (!(await this.master.getDistributor(input.distributorId))) throw new StockRefusal(STOCK_CODES.outletNotFound, 'No such distributor.');
    const prev = previousMonthOf(input.month);
    const { to } = monthRange(input.month);
    const from = monthRange(prev).from;
    const timeZone = await this.clock.timeZone();
    const [products, saved, counts, orderSums] = await Promise.all([
      this.master.listActiveProducts(),
      this.statements.list({ fromMonth: prev, toMonth: input.month, distributorId: input.distributorId }, LIMIT),
      this.stock.listRange({ fromMonth: prev, toMonth: input.month, outletType: 'DISTRIBUTOR', outletId: input.distributorId }, LIMIT),
      this.orders.sumDistributorOrders({ from, to, timeZone, distributorId: input.distributorId }),
    ]);
    const thisSaved = new Map(saved.filter((s) => s.month === input.month).map((s) => [key(s.productId), s]));
    const prevSaved = new Map(saved.filter((s) => s.month === prev).map((s) => [key(s.productId), s]));
    const thisCount = new Map(counts.filter((c) => c.month === input.month).map((c) => [key(c.productId), c]));
    const prevCount = new Map(counts.filter((c) => c.month === prev).map((c) => [key(c.productId), c]));
    const orderQty = doneByProduct(orderSums, input.month);
    const prevOrderQty = doneByProduct(orderSums, prev);

    const people = await this.users.getUserSummaries([...new Set([...thisCount.values()].map((c) => c.recordedBy).concat([...thisSaved.values()].map((s) => s.updatedBy)))]);
    const name = (id: string) => ({ id, name: people.find((p) => p.id === id)?.name ?? UNKNOWN });

    const lines: StatementLineDto[] = products
      .map((p): StatementLineDto => {
        const s = thisSaved.get(key(p.id));
        const c = thisCount.get(key(p.id));
        const last = stockFigure({ orderQty: prevOrderQty.get(key(p.id)) ?? 0, count: countFigure(prevCount.get(key(p.id))), statement: statementFigure(prevSaved.get(key(p.id))) });
        const figure = stockFigure({ orderQty: orderQty.get(key(p.id)) ?? 0, count: countFigure(c), statement: statementFigure(s) });
        const flags: StatementFlag[] = [...figure.flags];
        if (figure.openingQty !== null && last.closingQty !== null && last.closingQty !== figure.openingQty) flags.push('OPENING_MISMATCH');
        // Opening follows last month's closing; only a distributor's first month falls back to the opening a field worker counted.
        const suggested = s ? null : (last.closingQty ?? c?.openingQty ?? null);
        return {
          product: { id: p.id, name: p.name, sku: p.sku },
          saved: Boolean(s),
          openingQty: s ? s.openingQty : suggested,
          openingSuggested: !s,
          orderPrimaryQty: figure.orderPrimaryQty,
          adjustmentQty: figure.adjustmentQty,
          adjustmentReason: s?.adjustmentReason ?? null,
          primaryQty: figure.primaryQty,
          secondaryQty: figure.secondaryQty,
          closingQty: figure.closingQty,
          count: c ? { openingQty: c.openingQty, closingQty: c.closingQty, by: name(c.recordedBy), at: c.recordedAt.toISOString() } : null,
          source: figure.source,
          flags,
          updatedBy: s ? name(s.updatedBy) : null,
          updatedAt: s ? s.updatedAt.toISOString() : null,
        };
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
    return { distributorId: input.distributorId, month: input.month, lines };
  }
}
