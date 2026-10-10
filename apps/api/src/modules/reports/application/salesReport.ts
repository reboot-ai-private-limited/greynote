import type { SalesStatementDto, SalesYearReportDto } from '@greynote/contracts';
import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { assertTimeZone, businessDate, leaveYearRange, monthRange, parseMonthName } from '@/shared/time/businessTime.js';
import { buildSalesMonths, buildStatement, previousMonth, yearMonths, type StatementCount, type StockCount } from '../domain/salesFigures.js';
import type { MasterPort, SalesPort, StatementRow, StatementsPort, StockRow } from '../domain/ports.js';

const UNKNOWN = '(removed)';

const toStatements = (rows: readonly StatementRow[]): StatementCount[] => rows.map((r) => ({ distributorId: r.distributorId, productId: r.productId, month: r.month, openingQty: r.openingQty, secondaryQty: r.secondaryQty, adjustmentQty: r.adjustmentQty }));
const toCounts = (rows: readonly StockRow[]): StockCount[] => rows.map((r) => ({ distributorId: r.outlet.id, productId: r.productId, month: r.month, openingQty: r.openingQty, closingQty: r.closingQty }));

/**
 * Primary and secondary sales (sign-off K9, K21, K22, K31): primary is every Done order to a distributor, in the month marked Done; secondary is
 * what the distributors sold on, derived from their own counts (opening + primary − closing) and valued at each product's PTR. The year view feeds the
 * bar chart; the statement is one month in full. Reads only.
 */
export class SalesReport {
  constructor(
    private readonly sales: SalesPort & StatementsPort,
    private readonly master: MasterPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async currentMonth(): Promise<string> {
    const zone = await readConfig(this.config, 'BUSINESS_TIMEZONE', (v) => {
      assertTimeZone(v);
      return v;
    });
    return businessDate(this.now(), zone).slice(0, 7);
  }

  async year(input: { year: number; distributorId?: string | undefined; productId?: string | undefined }): Promise<SalesYearReportDto> {
    const startMonth = await readConfig(this.config, 'FY_START_MONTH', parseMonthName);
    const range = leaveYearRange(input.year, startMonth);
    const months = yearMonths(range.from);
    const filter = { ...(input.distributorId && { distributorId: input.distributorId }), ...(input.productId && { productId: input.productId }) };
    const [orderSums, stockRows, statementRows, outlets, currentMonth] = await Promise.all([
      this.sales.sumDistributorOrders({ from: range.from, to: range.to, ...filter }),
      this.sales.listStockRange({ fromMonth: months[0]!, toMonth: months[11]!, outletType: 'DISTRIBUTOR', ...(input.distributorId && { outletId: input.distributorId }), ...(input.productId && { productId: input.productId }) }),
      this.sales.listStatements({ fromMonth: months[0]!, toMonth: months[11]!, ...(input.distributorId && { distributorId: input.distributorId }), ...(input.productId && { productId: input.productId }) }),
      this.master.listActiveOutlets(),
      this.currentMonth(),
    ]);
    const names = await this.master.listNames({ productIds: [...new Set([...stockRows.map((r) => r.productId), ...orderSums.map((s) => s.productId), ...statementRows.map((r) => r.productId)])] });
    const ptr = new Map(names.products.map((p) => [p.id, p.ptrPaise]));
    const pts = new Map(names.products.map((p) => [p.id, p.ptsPaise ?? null]));
    const expected = outlets.distributors.map((d) => d.id).filter((id) => !input.distributorId || id === input.distributorId);
    const built = buildSalesMonths({ months, currentMonth, orderSums, stock: toCounts(stockRows), statements: toStatements(statementRows), ptr, pts, expectedDistributorIds: expected });
    const totals = built.reduce((t, m) => ({ primaryQty: t.primaryQty + m.primaryQty, primaryPaise: t.primaryPaise + m.primaryPaise, secondaryQty: t.secondaryQty + (m.secondaryQty ?? 0), secondaryPaise: t.secondaryPaise + (m.secondaryPaise ?? 0) }), { primaryQty: 0, primaryPaise: 0, secondaryQty: 0, secondaryPaise: 0 });
    return { year: input.year, months: built, totals };
  }

  async statement(input: { month: string; distributorId?: string | undefined; productId?: string | undefined }): Promise<SalesStatementDto> {
    const { from, to } = monthRange(input.month);
    const prev = previousMonth(input.month);
    const [orderSums, stockRows, statementRows, outlets] = await Promise.all([
      this.sales.sumDistributorOrders({ from: monthRange(prev).from, to, ...(input.distributorId && { distributorId: input.distributorId }), ...(input.productId && { productId: input.productId }) }),
      this.sales.listStockRange({ fromMonth: prev, toMonth: input.month, outletType: 'DISTRIBUTOR', ...(input.distributorId && { outletId: input.distributorId }), ...(input.productId && { productId: input.productId }) }),
      this.sales.listStatements({ fromMonth: prev, toMonth: input.month, ...(input.distributorId && { distributorId: input.distributorId }), ...(input.productId && { productId: input.productId }) }),
      this.master.listActiveOutlets(),
    ]);
    const stock = toCounts(stockRows);
    const statements = toStatements(statementRows);
    const monthSums = orderSums.filter((s) => s.month === input.month);
    const stated = statements.filter((c) => c.month === input.month);
    const distributorIds = [...new Set([...monthSums.map((s) => s.distributorId), ...stock.filter((c) => c.month === input.month).map((c) => c.distributorId), ...stated.map((c) => c.distributorId)])];
    const names = await this.master.listNames({ distributorIds, productIds: [...new Set([...monthSums.map((s) => s.productId), ...stock.map((c) => c.productId), ...statements.map((c) => c.productId)])] });
    const ptr = new Map(names.products.map((p) => [p.id, p.ptrPaise]));
    const pts = new Map(names.products.map((p) => [p.id, p.ptsPaise ?? null]));
    const distributor = new Map(names.distributors.map((d) => [d.id, d.name]));
    const product = new Map(names.products.map((p) => [p.id, p]));

    const rows = buildStatement({ month: input.month, orderSums, stock, statements, ptr, pts })
      .map(({ distributorId, productId, ...rest }) => ({
        distributor: { id: distributorId, name: distributor.get(distributorId) ?? UNKNOWN },
        product: { id: productId, name: product.get(productId)?.name ?? UNKNOWN, sku: product.get(productId)?.sku ?? '' },
        ...rest,
      }))
      .sort((a, b) => a.distributor.name.localeCompare(b.distributor.name) || a.product.name.localeCompare(b.product.name));

    const counted = new Set([...stock.filter((c) => c.month === input.month).map((c) => c.distributorId), ...stated.filter((c) => c.secondaryQty !== null).map((c) => c.distributorId)]);
    const missingDistributors = outlets.distributors.filter((d) => (!input.distributorId || d.id === input.distributorId) && !counted.has(d.id));
    const totals = rows.reduce(
      (t, r) => ({
        primaryQty: t.primaryQty + r.primaryQty,
        primaryPaise: t.primaryPaise + r.primaryPaise,
        placedPaise: t.placedPaise + 0,
        secondaryQty: t.secondaryQty + (r.secondaryQty !== null && r.secondaryQty >= 0 ? r.secondaryQty : 0),
        secondaryPaise: t.secondaryPaise + (r.secondaryPaise ?? 0),
      }),
      { primaryQty: 0, primaryPaise: 0, placedPaise: 0, secondaryQty: 0, secondaryPaise: 0 },
    );
    totals.placedPaise = monthSums.filter((s) => s.status === 'PLACED').reduce((n, s) => n + s.amountPaise, 0);
    return { month: input.month, rows, missingDistributors, totals };
  }
}
