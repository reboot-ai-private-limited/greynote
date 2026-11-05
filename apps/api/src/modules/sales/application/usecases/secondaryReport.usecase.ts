import type { SecondaryReportDistributorDto, SecondaryReportDto, SecondaryReportLineDto } from '@greynote/contracts';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import { closingOf } from '../../domain/secondaryStockLine.entity.js';
import type { SecondaryStockLineRepositoryPort } from '../../domain/secondaryStockLine.repository.port.js';
import { STOCK_CODES, StockRefusal } from '../../domain/stockRefusal.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../outletAccess.js';
import { addTotals, emptyTotals } from './secondaryStock.usecase.js';

/**
 * The manager's view: the **approved** rows of the MRs in their whole downline (everyone for Admin), summed distributor by distributor and product.
 * Only MRs (people with nobody below them) contribute, because a manager has no rows of their own and a senior manager must not add a junior manager's
 * roll-up on top of the same MRs. Values are units × PTS.
 */
export class ReadSecondaryReportUseCase {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly master: FieldMasterDataPort,
    private readonly lines: SecondaryStockLineRepositoryPort,
  ) {}

  async execute(actor: Actor, input: { month: string; managerId?: string | undefined }): Promise<SecondaryReportDto> {
    const managerId = actor.role === 'ADMIN' ? input.managerId : actor.id;
    if (actor.role !== 'ADMIN' && actor.role !== 'FIELD') throw new StockRefusal(STOCK_CODES.adminOnly, 'Not available to your role.');
    if (actor.role === 'FIELD' && input.managerId && input.managerId !== actor.id) {
      if (!(await this.users.getDownline(actor.id)).some((u) => u.id === input.managerId)) throw new StockRefusal(STOCK_CODES.notYourTeam, 'You can only see your own team.');
    }
    const root = actor.role === 'FIELD' ? (input.managerId ?? actor.id) : managerId;
    const pool = root ? (await this.users.getDownline(root)).filter((u) => u.role === 'FIELD' && u.status === 'active') : (await this.users.getUserSummaries(await this.users.listActiveFieldUserIds()));
    const mrs: typeof pool = [];
    for (const u of pool) if ((await this.users.getDownline(u.id)).length === 0) mrs.push(u);
    const names = new Map(mrs.map((u) => [u.id, u.name]));
    const rows = await this.lines.listRange({ fromMonth: input.month, toMonth: input.month, userIds: mrs.map((u) => u.id) }, 100_000);
    const products = new Map((await this.master.listActiveProducts()).map((p) => [p.id, p]));

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
      line.byMr.push({ userId: r.userId, name: names.get(r.userId) ?? '(removed)', openingQty: r.openingQty, primaryQty: r.primaryQty, issuedQty: r.issuedQty, closingQty: closing });
      perProduct.set(r.productId, line);
      byDist.set(r.distributorId, perProduct);
    }

    const distributors: SecondaryReportDistributorDto[] = [];
    for (const [distributorId, perProduct] of byDist) {
      const lines = [...perProduct.values()].sort((a, b) => a.product.name.localeCompare(b.product.name));
      distributors.push({ distributorId, name: (await this.master.getDistributor(distributorId))?.name ?? '(removed)', lines, totals: lines.reduce((t, l) => addTotals(t, l), emptyTotals()) });
    }
    distributors.sort((a, b) => a.name.localeCompare(b.name));
    return { month: input.month, mrCount: mrs.length, approvedMrCount: new Set(rows.map((r) => r.userId)).size, distributors, totals: distributors.reduce((t, d) => addTotals(t, { ...d.totals }), emptyTotals()) };
  }
}
