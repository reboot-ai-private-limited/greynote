import type { EmployeeProductFigureDto, EmployeeSalesReportDto, EmployeeTargetFigureDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { monthRange } from '@/shared/time/businessTime.js';
import { percentOf, primaryOf, secondaryOf, type PriceRow } from '../domain/employeeFigures.js';
import type { EmployeeSalesPort, FieldRosterPort, IdentityPort, MarketingPort, MasterPort } from '../domain/ports.js';

const UNKNOWN = '(removed)';

export interface EmployeeSalesInput {
  actor: { id: string; role: string };
  userId: string;
  /** `YYYY-MM`, both inclusive. */
  from: string;
  to: string;
}

/**
 * One employee over a run of months (decision-log 2026-10-10): their targets, their primary (Done distributor orders plus Admin's change, at the
 * order amounts and PTS) and their secondary (what they entered, at PTR), product by product. Achievement is the secondary. The employee sees their
 * own, a manager their downline's, Admin anyone's. Reads only.
 */
export class EmployeeSalesReport {
  constructor(
    private readonly sales: EmployeeSalesPort,
    private readonly marketing: MarketingPort,
    private readonly master: MasterPort,
    private readonly identity: IdentityPort,
    private readonly roster: Pick<FieldRosterPort, 'getDownline'>,
  ) {}

  async read(input: EmployeeSalesInput): Promise<EmployeeSalesReportDto> {
    if (input.to < input.from) throw AppError.badRequest('The range ends before it starts.');
    await this.assertMayRead(input.actor, input.userId);
    const [employee] = await this.identity.getUserSummaries([input.userId]);
    if (!employee) throw AppError.notFound('No such employee.');

    const window = { from: monthRange(input.from).from, to: monthRange(input.to).to };
    const [orders, entries, shares] = await Promise.all([
      this.sales.sumUserOrders({ ...window, userIds: [input.userId] }),
      this.sales.listEmployeeSales({ fromMonth: input.from, toMonth: input.to, userIds: [input.userId] }),
      this.marketing.listTargetShares([input.userId], input.from, input.to),
    ]);
    // A target may reach beyond the window, so its own achievement needs the secondary over all its months.
    const reach = shares.reduce((r, t) => ({ from: t.fromMonth < r.from ? t.fromMonth : r.from, to: t.toMonth > r.to ? t.toMonth : r.to }), { from: input.from, to: input.to });
    const wide = reach.from === input.from && reach.to === input.to ? entries : await this.sales.listEmployeeSales({ fromMonth: reach.from, toMonth: reach.to, userIds: [input.userId] });

    const productIds = [...new Set([...orders.map((o) => o.productId), ...entries.map((e) => e.productId), ...shares.flatMap((t) => (t.productId ? [t.productId] : []))])];
    const names = productIds.length ? await this.master.listNames({ productIds }) : { products: [] };
    const prices = new Map<string, PriceRow>(names.products.map((p) => [p.id, { id: p.id, name: p.name, sku: p.sku, ptrPaise: p.ptrPaise, ptsPaise: p.ptsPaise ?? null }]));
    const nameOf = (id: string) => prices.get(id)?.name ?? UNKNOWN;

    const range = { userId: input.userId, fromMonth: input.from, toMonth: input.to };
    const products = productIds
      .map((id): EmployeeProductFigureDto => {
        const sel = { ...range, productId: id };
        const primary = primaryOf(orders, entries, prices, sel);
        const secondary = secondaryOf(entries, prices, sel);
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
          flags: [...(secondary.unpricedQty > 0 ? (['NO_PTR'] as const) : []), ...(primary.unpricedQty !== 0 ? (['NO_PTS'] as const) : [])],
        };
      })
      .sort((a, b) => a.product.name.localeCompare(b.product.name));

    const generalTargetPaise = shares.filter((t) => t.productId === null).reduce((n, t) => n + t.sharePaise, 0);
    const targets = shares.map((t): EmployeeTargetFigureDto => {
      const achieved = secondaryOf(wide, prices, { userId: input.userId, productId: t.productId, fromMonth: t.fromMonth, toMonth: t.toMonth });
      return { id: t.id, product: t.productId ? { id: t.productId, name: nameOf(t.productId) } : null, fromMonth: t.fromMonth, toMonth: t.toMonth, amountPaise: t.amountPaise, achievedPaise: achieved.paise, achievementPercent: percentOf(achieved.paise, t.amountPaise), targetQty: t.qty, achievedQty: achieved.qty, achievementQtyPercent: t.qty === null ? null : percentOf(achieved.qty, t.qty) };
    });

    const all = { ...range };
    const totalSecondary = secondaryOf(entries, prices, all).paise;
    const totalTarget = generalTargetPaise + products.reduce((n, p) => n + p.targetPaise, 0);
    return {
      employee: { id: employee.id, name: employee.name, employeeCode: employee.employeeCode },
      fromMonth: input.from,
      toMonth: input.to,
      products,
      generalTargetPaise,
      totals: { targetPaise: totalTarget, primaryPaise: primaryOf(orders, entries, prices, all).paise, secondaryPaise: totalSecondary, achievementPercent: percentOf(totalSecondary, totalTarget) },
      targets,
    };
  }

  private async assertMayRead(actor: { id: string; role: string }, userId: string): Promise<void> {
    if (actor.role === 'ADMIN' || actor.id === userId) return;
    if (actor.role === 'FIELD' && (await this.roster.getDownline(actor.id)).some((u) => u.id === userId)) return;
    throw AppError.forbidden('You can only see your own figures and your team\'s.');
  }
}
