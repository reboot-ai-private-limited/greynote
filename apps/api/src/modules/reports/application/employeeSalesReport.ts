import type { EmployeeProductFigureDto, EmployeeSalesReportDto, EmployeeTargetFigureDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { monthRange } from '@/shared/time/businessTime.js';
import type { MrStockFigures } from './mrStockFigures.js';
import { primaryOfLines, secondaryOfLines } from '../domain/mrFigures.js';
import { MrRollup } from './mrRollup.js';
import { percentOf, type PriceRow } from '../domain/employeeFigures.js';
import type { DesignationLevelsPort, EmployeeSalesPort, FieldRosterPort, IdentityPort, MarketingPort, MasterPort } from '../domain/ports.js';

const UNKNOWN = '(removed)';

type Share = Awaited<ReturnType<MarketingPort['listTargetShares']>>[number];

/** Targets of several MRs for the same product and run of months added into one line. */
function mergeShares(rows: readonly Share[]): Share[] {
  const merged = new Map<string, Share>();
  for (const t of rows) {
    const key = `${t.productId ?? ''}|${t.fromMonth}|${t.toMonth}`;
    const into = merged.get(key);
    if (!into) {
      merged.set(key, { ...t });
      continue;
    }
    into.amountPaise += t.amountPaise;
    into.sharePaise += t.sharePaise;
    into.qty = into.qty === null && t.qty === null ? null : (into.qty ?? 0) + (t.qty ?? 0);
    into.shareQty = into.shareQty === null && t.shareQty === null ? null : (into.shareQty ?? 0) + (t.shareQty ?? 0);
  }
  return [...merged.values()];
}

export interface EmployeeSalesInput {
  actor: { id: string; role: string };
  userId: string;
  /** `YYYY-MM`, both inclusive. */
  from: string;
  to: string;
}

/**
 * One employee over a run of months (decision-log 2026-10-10): their targets, their primary and secondary, product by product, as the approved figures their
 * MRs entered, valued at PTS (decision-log 2026-11-05; the Done orders by distributor are listed for information). Achievement is the secondary. The employee sees their
 * own, a manager their downline's, Admin anyone's. Reads only.
 */
export class EmployeeSalesReport {
  constructor(
    private readonly sales: Pick<EmployeeSalesPort, 'sumUserOrders'>,
    private readonly marketing: MarketingPort,
    private readonly master: MasterPort,
    private readonly identity: IdentityPort,
    private readonly roster: Pick<FieldRosterPort, 'getDownline'> & DesignationLevelsPort,
    private readonly achievement: MrStockFigures,
  ) {
    this.rollup = new MrRollup(roster);
  }

  private readonly rollup: MrRollup;

  async read(input: EmployeeSalesInput): Promise<EmployeeSalesReportDto> {
    if (input.to < input.from) throw AppError.badRequest('The range ends before it starts.');
    await this.assertMayRead(input.actor, input.userId);
    const [employee] = await this.identity.getUserSummaries([input.userId]);
    if (!employee) throw AppError.notFound('No such employee.');

    // A manager's figures are the sum of the MRs in their whole team; an MR's are their own.
    const memberIds = (await this.rollup.scopes([input.userId])).get(input.userId) ?? [];
    const isManager = memberIds[0] !== input.userId;
    const members: ReadonlySet<string> = new Set(memberIds);
    const window = { from: monthRange(input.from).from, to: monthRange(input.to).to };
    const [orders, rawShares] = await Promise.all([
      // Done orders by distributor are information only; the figures below are the MRs' approved stock (decision-log 2026-11-05).
      this.sales.sumUserOrders({ ...window, userIds: memberIds }),
      this.marketing.listTargetShares(memberIds, input.from, input.to),
    ]);
    // Each MR's target for the same product and months is one line for the manager.
    const shares = isManager ? mergeShares(rawShares) : rawShares;
    // A target may reach beyond the window, so its own achievement needs the secondary over all its months.
    const reach = shares.reduce((r, t) => ({ from: t.fromMonth < r.from ? t.fromMonth : r.from, to: t.toMonth > r.to ? t.toMonth : r.to }), { from: input.from, to: input.to });
    // Achievement and primary are the approved figures the MRs entered, nothing else (decision-log 2026-11-05).
    // A manager's achievement is their own approved team report (and any approved rows of their own), not a live sum of the MRs below them.
    const owners: ReadonlySet<string> = isManager ? new Set([input.userId]) : members;
    const managers = isManager ? [input.userId] : [];
    const sold = await this.achievement.forFigures(memberIds, managers, input.from, input.to);
    // A manager also sees what is still waiting: the approved MR reports below them, added up live, and where their own team report stands.
    const [waitingRows, reportStatuses] = isManager
      ? await Promise.all([this.achievement.lines(memberIds, input.from, input.to), this.achievement.rollupStatuses([input.userId], input.to)])
      : [[], new Map<string, string>()];
    const soldWide = reach.from === input.from && reach.to === input.to ? sold : await this.achievement.forFigures(memberIds, managers, reach.from, reach.to);

    const productIds = [...new Set([...sold.map((e) => e.productId), ...waitingRows.map((e) => e.productId), ...shares.flatMap((t) => (t.productId ? [t.productId] : []))])];
    const names = productIds.length ? await this.master.listNames({ productIds }) : { products: [] };
    const prices = new Map<string, PriceRow>(names.products.map((p) => [p.id, { id: p.id, name: p.name, sku: p.sku, ptrPaise: p.ptrPaise, ptsPaise: p.ptsPaise ?? null }]));
    const nameOf = (id: string) => prices.get(id)?.name ?? UNKNOWN;

    const range = { userIds: owners, fromMonth: input.from, toMonth: input.to };
    const products = productIds
      .map((id): EmployeeProductFigureDto => {
        const sel = { ...range, productId: id };
        const primary = primaryOfLines(sold, prices, sel);
        const secondary = secondaryOfLines(sold, prices, sel);
        const targetPaise = shares.filter((t) => t.productId === id).reduce((n, t) => n + t.sharePaise, 0);
        const price = prices.get(id);
        return {
          product: { id, name: nameOf(id), sku: price?.sku ?? '' },
          targetPaise,
          primaryQty: primary.qty,
          primaryPaise: primary.paise,
          secondaryQty: secondary.qty,
          secondaryPaise: secondary.paise,
          achievementPercent: percentOf(secondary.paise, targetPaise),
          flags: [...(secondary.unpricedQty > 0 ? (['NO_PTS'] as const) : []), ...(primary.unpricedQty !== 0 ? (['NO_PTS_CHANGE'] as const) : [])],
        };
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));

    const generalTargetPaise = shares.filter((t) => t.productId === null).reduce((n, t) => n + t.sharePaise, 0);
    const targets = shares.map((t): EmployeeTargetFigureDto => {
      const achieved = secondaryOfLines(soldWide, prices, { userIds: owners, productId: t.productId, fromMonth: t.fromMonth, toMonth: t.toMonth });
      return { id: t.id, product: t.productId ? { id: t.productId, name: nameOf(t.productId) } : null, fromMonth: t.fromMonth, toMonth: t.toMonth, amountPaise: t.amountPaise, achievedPaise: achieved.paise, achievementPercent: percentOf(achieved.paise, t.amountPaise), targetQty: t.qty, achievedQty: achieved.qty, achievementQtyPercent: t.qty === null ? null : percentOf(achieved.qty, t.qty) };
    });

    const byDistributor = new Map<string, { qty: number; paise: number }>();
    for (const o of orders) {
      if (o.month < input.from || o.month > input.to) continue;
      const key = o.distributorId ?? '';
      const row = byDistributor.get(key) ?? { qty: 0, paise: 0 };
      row.qty += o.quantity;
      row.paise += o.amountPaise;
      byDistributor.set(key, row);
    }
    const distributorNames = byDistributor.size ? await this.master.listNames({ distributorIds: [...byDistributor.keys()].filter(Boolean) }) : { distributors: [] };
    const distributors = [...byDistributor].map(([id, v]) => ({ distributor: { id, name: distributorNames.distributors.find((d) => d.id === id)?.name ?? 'Unknown' }, orderQty: v.qty, orderPaise: v.paise })).sort((a, b) => a.distributor.name.localeCompare(b.distributor.name));

    const all = { ...range };
    const totalSecondary = secondaryOfLines(sold, prices, all).paise;
    const totalTarget = generalTargetPaise + products.reduce((n, p) => n + p.targetPaise, 0);
    return {
      employee: { id: employee.id, name: employee.name, employeeCode: employee.employeeCode },
      fromMonth: input.from,
      toMonth: input.to,
      products,
      generalTargetPaise,
      totals: { targetPaise: totalTarget, primaryPaise: primaryOfLines(sold, prices, all).paise, secondaryPaise: totalSecondary, achievementPercent: percentOf(totalSecondary, totalTarget) },
      targets,
      distributors,
      team: isManager
        ? {
            mrCount: memberIds.length,
            approvedMrCount: new Set(waitingRows.map((l) => l.userId)).size,
            waitingPaise: secondaryOfLines(waitingRows, prices, { userIds: members, fromMonth: input.from, toMonth: input.to }).paise,
            waitingPrimaryPaise: primaryOfLines(waitingRows, prices, { userIds: members, fromMonth: input.from, toMonth: input.to }).paise,
            reportStatus: (reportStatuses.get(input.userId) ?? 'NOT_SUBMITTED') as 'NOT_SUBMITTED' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED',
          }
        : null,
    };
  }

  private async assertMayRead(actor: { id: string; role: string }, userId: string): Promise<void> {
    if (actor.role === 'ADMIN' || actor.role === 'ACCOUNTANT' || actor.role === 'HR' || actor.id === userId) return;
    if (actor.role === 'FIELD' && (await this.roster.getDownline(actor.id)).some((u) => u.id === userId)) return;
    throw AppError.forbidden('You can only see your own figures and your team\'s.');
  }
}
