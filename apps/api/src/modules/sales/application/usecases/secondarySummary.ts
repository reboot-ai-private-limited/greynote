import type { SecondaryReportDistributorDto, SecondaryReportLineDto, SecondaryStockTotalsDto, StockCountStatus } from '@greynote/contracts';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import { closingOf } from '../../domain/secondaryStockLine.entity.js';

/** Where a month stands from its distributors' statuses: anything unfinished first, so a month is only Approved when every distributor is. */
export function monthStatusOf(statuses: readonly StockCountStatus[]): 'NOT_ENTERED' | StockCountStatus {
  if (statuses.length === 0) return 'NOT_ENTERED';
  for (const s of ['REJECTED', 'DRAFT', 'PENDING'] as const) if (statuses.includes(s)) return s;
  return 'APPROVED';
}

const EMPTY: SecondaryStockTotalsDto = { openingQty: 0, primaryQty: 0, issuedQty: 0, closingQty: 0, issuedAmountPaise: 0, closingAmountPaise: 0 };
export const emptyTotals = (): SecondaryStockTotalsDto => ({ ...EMPTY });
export function addTotals(a: SecondaryStockTotalsDto, l: Pick<SecondaryStockTotalsDto, 'openingQty' | 'primaryQty' | 'issuedQty' | 'closingQty'> & { issuedAmountPaise: number | null; closingAmountPaise: number | null }): SecondaryStockTotalsDto {
  return { openingQty: a.openingQty + l.openingQty, primaryQty: a.primaryQty + l.primaryQty, issuedQty: a.issuedQty + l.issuedQty, closingQty: a.closingQty + l.closingQty, issuedAmountPaise: a.issuedAmountPaise + (l.issuedAmountPaise ?? 0), closingAmountPaise: a.closingAmountPaise + (l.closingAmountPaise ?? 0) };
}

export interface SummaryRow {
  /** The MR the row is from; left out for a saved snapshot's frozen sums. */
  userId?: string;
  distributorId: string;
  productId: string;
  openingQty: number;
  primaryQty: number;
  issuedQty: number;
}

/**
 * Rows added up by distributor and product, in units and at PTS, with each MR's own figures under the product when the rows carry one. The manager's
 * report and a manager's snapshot are both drawn with it.
 */
export async function summariseSecondary(master: Pick<FieldMasterDataPort, 'listActiveProducts' | 'getDistributor'>, rows: readonly SummaryRow[], nameOf: (userId: string) => string = () => '(removed)'): Promise<{ distributors: SecondaryReportDistributorDto[]; totals: SecondaryStockTotalsDto }> {
  const products = new Map((await master.listActiveProducts()).map((p) => [p.id, p]));
  const byDist = new Map<string, Map<string, SecondaryReportLineDto>>();
  for (const r of rows) {
    const p = products.get(r.productId);
    if (!p) continue;
    const perProduct = byDist.get(r.distributorId) ?? new Map<string, SecondaryReportLineDto>();
    const pts = p.ptsPaise ?? null;
    const line = perProduct.get(r.productId) ?? { product: { id: p.id, name: p.name, sku: p.sku }, openingQty: 0, primaryQty: 0, issuedQty: 0, closingQty: 0, ptsPaise: pts, issuedAmountPaise: pts ? 0 : null, closingAmountPaise: pts ? 0 : null, byMr: [] };
    const closing = closingOf(r);
    line.openingQty += r.openingQty;
    line.primaryQty += r.primaryQty;
    line.issuedQty += r.issuedQty;
    line.closingQty += closing;
    if (pts) {
      line.issuedAmountPaise = (line.issuedAmountPaise ?? 0) + r.issuedQty * pts;
      line.closingAmountPaise = (line.closingAmountPaise ?? 0) + closing * pts;
    }
    if (r.userId) line.byMr.push({ userId: r.userId, name: nameOf(r.userId), openingQty: r.openingQty, primaryQty: r.primaryQty, issuedQty: r.issuedQty, closingQty: closing });
    perProduct.set(r.productId, line);
    byDist.set(r.distributorId, perProduct);
  }
  const distributors: SecondaryReportDistributorDto[] = [];
  for (const [distributorId, perProduct] of byDist) {
    const lines = [...perProduct.values()].sort((a, b) => a.product.name.localeCompare(b.product.name));
    distributors.push({ distributorId, name: (await master.getDistributor(distributorId))?.name ?? '(removed)', lines, totals: lines.reduce((t, l) => addTotals(t, l), emptyTotals()) });
  }
  distributors.sort((a, b) => a.name.localeCompare(b.name));
  return { distributors, totals: distributors.reduce((t, d) => addTotals(t, { ...d.totals }), emptyTotals()) };
}
