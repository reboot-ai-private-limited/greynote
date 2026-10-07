import type { StockReportDto, StockReportRowDto, StockRowFlag } from '@greynote/contracts';
import { monthRange } from '@/shared/time/businessTime.js';
import { previousMonth, secondaryQty } from '../domain/salesFigures.js';
import type { MasterPort, SalesPort, StockRow } from '../domain/ports.js';

const UNKNOWN = '(removed)';
const k = (outletId: string, productId: string) => `${outletId}|${productId}`;

/**
 * The month's stock counts of every Distributor and Chemist (sign-off K28): who has counted and who has not, and what does not add up — an
 * opening that is not last month's closing, and, for a distributor, a secondary that comes out below zero. A chemist's counts are information
 * (a chemist's orders are not part of primary or secondary). Reads only.
 */
export class StockReport {
  constructor(
    private readonly sales: SalesPort,
    private readonly master: MasterPort,
  ) {}

  async month(input: { month: string }): Promise<StockReportDto> {
    const prev = previousMonth(input.month);
    const { from, to } = monthRange(input.month);
    const [d, c, orders, outlets] = await Promise.all([
      this.sales.listStockRange({ fromMonth: prev, toMonth: input.month, outletType: 'DISTRIBUTOR' }),
      this.sales.listStockRange({ fromMonth: prev, toMonth: input.month, outletType: 'CHEMIST' }),
      this.sales.sumDistributorOrders({ from, to }),
      this.master.listActiveOutlets(),
    ]);
    const done = new Map<string, number>();
    for (const s of orders) if (s.status === 'DONE' && s.month === input.month) done.set(k(s.distributorId, s.productId), (done.get(k(s.distributorId, s.productId)) ?? 0) + s.quantity);

    const rowsOf = (stock: StockRow[]) => ({ now: stock.filter((r) => r.month === input.month), before: new Map(stock.filter((r) => r.month === prev).map((r) => [k(r.outlet.id, r.productId), r])) });
    const dist = rowsOf(d);
    const chem = rowsOf(c);
    const names = await this.master.listNames({
      distributorIds: dist.now.map((r) => r.outlet.id),
      chemistIds: chem.now.map((r) => r.outlet.id),
      productIds: [...new Set([...dist.now, ...chem.now].map((r) => r.productId))],
    });
    const outletName = { DISTRIBUTOR: new Map([...outlets.distributors, ...names.distributors].map((o) => [o.id, o.name])), CHEMIST: new Map([...outlets.chemists, ...names.chemists].map((o) => [o.id, o.name])) };
    const product = new Map(names.products.map((p) => [p.id, p]));

    const rows: StockReportRowDto[] = [];
    const build = (type: 'DISTRIBUTOR' | 'CHEMIST', side: ReturnType<typeof rowsOf>, active: Array<{ id: string; name: string }>) => {
      const counted = new Set(side.now.map((r) => r.outlet.id));
      for (const r of side.now) {
        const last = side.before.get(k(r.outlet.id, r.productId));
        const flags: StockRowFlag[] = [];
        if (last && last.closingQty !== r.openingQty) flags.push('OPENING_MISMATCH');
        if (type === 'DISTRIBUTOR' && secondaryQty(r.openingQty, done.get(k(r.outlet.id, r.productId)) ?? 0, r.closingQty) < 0) flags.push('NEGATIVE_SECONDARY');
        rows.push({
          outletType: type,
          outlet: { id: r.outlet.id, name: outletName[type].get(r.outlet.id) ?? UNKNOWN },
          product: { id: r.productId, name: product.get(r.productId)?.name ?? UNKNOWN, sku: product.get(r.productId)?.sku ?? '' },
          openingQty: r.openingQty,
          previousClosingQty: last?.closingQty ?? null,
          closingQty: r.closingQty,
          flags,
        });
      }
      for (const o of active.filter((x) => !counted.has(x.id))) rows.push({ outletType: type, outlet: { id: o.id, name: o.name }, product: null, openingQty: null, previousClosingQty: null, closingQty: null, flags: ['NO_COUNT'] });
      return { counted: active.filter((x) => counted.has(x.id)).length, expected: active.length };
    };
    const distributors = build('DISTRIBUTOR', dist, outlets.distributors);
    const chemists = build('CHEMIST', chem, outlets.chemists);
    rows.sort((a, b) => a.outletType.localeCompare(b.outletType) || a.outlet.name.localeCompare(b.outlet.name) || (a.product?.name ?? '').localeCompare(b.product?.name ?? ''));
    return { month: input.month, rows, completeness: { distributors, chemists }, flagged: rows.filter((r) => r.flags.length > 0).length };
  }
}
