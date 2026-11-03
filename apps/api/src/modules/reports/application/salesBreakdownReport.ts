import type { SalesByDistributorDto, SalesByEmployeeDto, SalesByProductDto, SalesPeriodKind, SalesWindowDto } from '@greynote/contracts';
import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { leaveYearRange, monthRange, parseMonthName } from '@/shared/time/businessTime.js';
import { percentOf, primaryOf, secondaryOf, type PriceRow } from '../domain/employeeFigures.js';
import type { DistributorAchievement } from './distributorAchievement.js';
import type { EmployeeSalesPort, MarketingPort, MasterPort, FieldRosterPort, DesignationLevelsPort } from '../domain/ports.js';
import { MrRollup } from './mrRollup.js';
import type { SalesDashboardReport } from './salesDashboardReport.js';
import type { SalesReport } from './salesReport.js';
import { addRow, emptyFigures, groupRows } from '../domain/salesBreakdown.js';
import { windowMonths } from '../domain/salesWindow.js';

const UNKNOWN = '(removed)';

export interface SalesWindowInput {
  year: number;
  period: SalesPeriodKind;
  month?: string | undefined;
  quarter?: number | undefined;
}

/**
 * Sales rolled up one way at a time (decision-log 2026-11-03): by product, by distributor, by employee — each for a month, a quarter or a year of
 * the financial year. The product and distributor figures come from the same statement rows as the old statement, so they always agree with it;
 * targets stay per employee (a product's target is the sum of its employees'). Reads only.
 */
export class SalesBreakdownReport {
  private readonly rollup: MrRollup;

  constructor(
    private readonly sales: SalesReport,
    private readonly dashboard: SalesDashboardReport,
    private readonly marketing: MarketingPort,
    private readonly employeeSales: EmployeeSalesPort,
    private readonly master: MasterPort,
    private readonly achievement: DistributorAchievement,
    roster: Pick<FieldRosterPort, 'getDownline'> & DesignationLevelsPort,
    private readonly config: ConfigReader,
  ) {
    this.rollup = new MrRollup(roster);
  }

  private async window(input: SalesWindowInput): Promise<{ months: string[]; dto: SalesWindowDto }> {
    const startMonth = await readConfig(this.config, 'FY_START_MONTH', parseMonthName);
    const months = windowMonths({ firstDay: leaveYearRange(input.year, startMonth).from, period: input.period, month: input.month, quarter: input.quarter });
    return { months, dto: { period: input.period, year: input.year, fromMonth: months[0]!, toMonth: months[months.length - 1]! } };
  }

  async byProduct(input: SalesWindowInput & { distributorId?: string | undefined }): Promise<SalesByProductDto> {
    const { months, dto } = await this.window(input);
    const { rows, products } = await this.sales.windowRows(months, { distributorId: input.distributorId });
    const figures = groupRows(rows, (r) => r.productId);
    const everyone = await this.dashboard.audience({ id: '', role: 'ADMIN' }, 'all');
    const shares = await this.marketing.listTargetShares(everyone.map((p) => p.id), dto.fromMonth, dto.toMonth);
    const targetOf = new Map<string, number>();
    for (const t of shares) if (t.productId) targetOf.set(t.productId, (targetOf.get(t.productId) ?? 0) + t.sharePaise);
    const ids = new Set([...figures.keys(), ...targetOf.keys()]);
    const missing = [...ids].filter((id) => !products.has(id));
    const extra = missing.length ? await this.master.listNames({ productIds: missing }) : { products: [] };
    for (const p of extra.products) products.set(p.id, { name: p.name, sku: p.sku });

    const out = [...ids].map((id) => {
      const f = figures.get(id) ?? emptyFigures();
      const targetPaise = targetOf.get(id) ?? 0;
      return { product: { id, name: products.get(id)?.name ?? UNKNOWN, sku: products.get(id)?.sku ?? '' }, ...f, targetPaise, achievementPercent: percentOf(f.secondaryPaise, targetPaise) };
    }).sort((a, b) => a.product.name.localeCompare(b.product.name));
    const totals = { ...emptyFigures(), targetPaise: 0 };
    for (const r of out) {
      totals.primaryQty += r.primaryQty;
      totals.primaryPaise += r.primaryPaise;
      totals.secondaryQty += r.secondaryQty;
      totals.secondaryPaise += r.secondaryPaise;
      totals.targetPaise += r.targetPaise;
    }
    const generalTargetPaise = shares.filter((t) => t.productId === null).reduce((n, t) => n + t.sharePaise, 0);
    return { window: dto, rows: out, generalTargetPaise, totals };
  }

  async byDistributor(input: SalesWindowInput & { productId?: string | undefined }): Promise<SalesByDistributorDto> {
    const { months, dto } = await this.window(input);
    const { rows, distributors, counted } = await this.sales.windowRows(months, { productId: input.productId });
    const figures = groupRows(rows, (r) => r.distributorId);
    const productsOf = new Map<string, Set<string>>();
    for (const r of rows) productsOf.set(r.distributorId, (productsOf.get(r.distributorId) ?? new Set<string>()).add(r.productId));
    const out = [...figures].map(([id, f]) => ({ distributor: { id, name: distributors.get(id) ?? UNKNOWN }, ...f, products: productsOf.get(id)?.size ?? 0, countedMonths: counted.get(id)?.size ?? 0 })).sort((a, b) => a.distributor.name.localeCompare(b.distributor.name));
    const totals = emptyFigures();
    for (const r of rows) addRow(totals, r);
    const active = (await this.master.listActiveOutlets()).distributors;
    const missingDistributors = active.filter((d) => !counted.has(d.id));
    return { window: dto, rows: out, missingDistributors, totals };
  }

  async byEmployee(input: SalesWindowInput & { actor: { id: string; role: string }; search?: string | undefined }): Promise<SalesByEmployeeDto> {
    const { dto } = await this.window(input);
    const { fromMonth, toMonth } = dto;
    const people = await this.dashboard.audience(input.actor, 'all');
    const needle = input.search?.toLowerCase();
    const listed = needle ? people.filter((p) => p.name.toLowerCase().includes(needle) || p.employeeCode.toLowerCase().includes(needle)) : people;
    const scopes = await this.rollup.scopes(listed.map((p) => p.id));
    const figureIds = [...new Set([...scopes.values()].flat())];
    const months = { from: monthRange(fromMonth).from, to: monthRange(toMonth).to };
    const [shares, orders, entries, sold] = await Promise.all([
      this.marketing.listTargetShares(figureIds, fromMonth, toMonth),
      this.employeeSales.sumUserOrders({ ...months, userIds: figureIds }),
      this.employeeSales.listEmployeeSales({ fromMonth, toMonth, userIds: figureIds }),
      this.achievement.entries(figureIds, fromMonth, toMonth),
    ]);
    const productIds = [...new Set([...orders.map((o) => o.productId), ...entries.map((e) => e.productId), ...sold.map((e) => e.productId)])];
    const names = productIds.length ? await this.master.listNames({ productIds }) : { products: [] };
    const prices = new Map<string, PriceRow>(names.products.map((p) => [p.id, { id: p.id, name: p.name, sku: p.sku, ptrPaise: p.ptrPaise, ptsPaise: p.ptsPaise ?? null }]));
    const figuresOf = (members: ReadonlySet<string>) => {
      const sel = { userIds: members, fromMonth, toMonth };
      const targetPaise = shares.filter((t) => members.has(t.userId)).reduce((n, t) => n + t.sharePaise, 0);
      const achievedPaise = secondaryOf(sold, prices, sel).paise;
      return { targetPaise, achievedPaise, primaryPaise: primaryOf(orders, entries, prices, sel).paise };
    };
    const rows = listed.map((p) => {
      const members = scopes.get(p.id) ?? [];
      const f = figuresOf(new Set(members));
      return { employee: { id: p.id, name: p.name, employeeCode: p.employeeCode }, designation: p.designation ?? null, ...f, achievementPercent: percentOf(f.achievedPaise, f.targetPaise), mrCount: members[0] === p.id ? null : members.length };
    }).sort((a, b) => a.employee.name.localeCompare(b.employee.name));
    const all = figuresOf(new Set(figureIds));
    return { window: dto, rows, totals: { ...all, achievementPercent: percentOf(all.achievedPaise, all.targetPaise) } };
  }
}
