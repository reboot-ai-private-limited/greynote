import type { SalesDashboardComplianceDto, SalesDashboardDto, SalesDashboardRowDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { readBusinessDay, type ConfigReader } from '@/shared/config/readConfig.js';
import { businessDate, eachDate } from '@/shared/time/businessTime.js';
import { primaryOfLines, secondaryOfLines } from '../domain/mrFigures.js';
import type { MrStockFigures } from './mrStockFigures.js';
import { MrRollup } from './mrRollup.js';
import type { PriceRow } from '../domain/employeeFigures.js';
import type { AttendancePort, DesignationLevelsPort, FieldDaysPort, FieldRosterPort, MarketingPort, MasterPort, PlanningPort, TerritoryPort, ZoneNamePort } from '../domain/ports.js';

/** The most days one dashboard read covers. A year's worth would mean a year of attendance for every employee on the page. */
export const SALES_DASHBOARD_MAX_DAYS = 93;

/** Days that are not the employee's to work: they had not joined, or it was a holiday, their weekly off, or approved leave. */
const NOT_WORKING: ReadonlySet<string> = new Set(['BEFORE_JOINING', 'NOT_EMPLOYED', 'HOLIDAY', 'WEEKLY_OFF', 'LEAVE']);
/** Past the employee and into the approval chain — "submitted" in the sense sign-off B7 counts it. */
const SUBMITTED: ReadonlySet<string> = new Set(['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED']);

const UNKNOWN = '(removed)';

export interface SalesDashboardInput {
  actor: { id: string; role: string };
  /** A manager's level: direct reports, deeper people, or both (default). Admin sees everyone either way. */
  scope?: 'direct' | 'indirect' | 'all' | undefined;
  /** One person only. A manager must have them in their downline (403 otherwise). */
  userId?: string | undefined;
  from: string;
  to: string;
  search?: string | undefined;
  page: number;
  pageSize: number;
}

const monthsOf = (dates: string[]): string[] => [...new Set(dates.map((d) => d.slice(0, 7)))];

/**
 * The field force over a date range in one table: plan and daily-report compliance, TA and DA, and the month's target against what was entered
 * as sold. Admin sees every active field employee; a manager sees their downline, and nobody else may read it. Office staff are never listed.
 * A manager's target, achievement and primary are the sum of the MRs in their whole team (`MrRollup`), so the totals add up each MR once.
 * "Of N days" counts the employee's working days (attendance), so a holiday or approved leave never makes anyone look late.
 */
export class SalesDashboardReport {
  constructor(
    private readonly identity: FieldRosterPort & DesignationLevelsPort,
    private readonly planning: PlanningPort,
    private readonly attendance: AttendancePort,
    private readonly fieldActivity: FieldDaysPort,
    private readonly marketing: MarketingPort,
    private readonly master: MasterPort,
    private readonly territory: TerritoryPort & ZoneNamePort,
    private readonly config: ConfigReader,
    private readonly achievement: MrStockFigures,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.rollup = new MrRollup(identity);
  }

  private readonly rollup: MrRollup;

  async read(input: SalesDashboardInput): Promise<SalesDashboardDto> {
    const { timeZone: zone, dayStart } = await readBusinessDay(this.config);
    const today = businessDate(this.now(), zone, dayStart);
    const from = input.from;
    const to = input.to < today ? input.to : today;
    if (input.to < from) throw AppError.badRequest('The range ends before it starts.');
    const fromMonth = from.slice(0, 7);
    const toMonth = to.slice(0, 7);
    const dates = from <= to ? eachDate(from, to) : [];
    if (dates.length > SALES_DASHBOARD_MAX_DAYS) throw AppError.badRequest(`Pick at most ${SALES_DASHBOARD_MAX_DAYS} days.`);

    const people = await this.audience(input.actor, input.scope ?? 'all', input.userId);
    const needle = input.search?.toLowerCase();
    const matching = needle ? people.filter((p) => p.name.toLowerCase().includes(needle) || p.employeeCode.toLowerCase().includes(needle)) : people;
    const ids = matching.map((p) => p.id);

    // Whose figures each row adds up: an MR's own, a manager's MRs. Everything is read once for all of them.
    const scopes = await this.rollup.scopes(ids);
    const figureIds = [...new Set([...scopes.values()].flat())];
    const range = { from, to };
    // A manager (anyone whose figures are their MRs') is judged by their own approved team report, not by a live sum of those MRs.
    const managerIds = ids.filter((id) => scopes.get(id)?.[0] !== id);
    const [taDa, shares, sold, rollupOf] = await Promise.all([
      dates.length ? this.fieldActivity.summarizeTaDaByUser(range) : Promise.resolve([]),
      this.marketing.listTargetShares(figureIds, fromMonth, toMonth),
      // Achievement and primary are the approved figures the MRs entered (decision-log 2026-11-05); nothing approved is 0.
      this.achievement.forFigures(figureIds, managerIds, fromMonth, toMonth),
      this.achievement.rollupStatuses(managerIds, toMonth),
    ]);
    const taDaOf = new Map(taDa.map((t) => [t.userId, t]));
    const productIds = [...new Set(sold.map((e) => e.productId))];
    const names = productIds.length ? await this.master.listNames({ productIds }) : { products: [] };
    const prices = new Map<string, PriceRow>(names.products.map((p) => [p.id, { id: p.id, name: p.name, sku: p.sku, ptrPaise: p.ptrPaise, ptsPaise: p.ptsPaise ?? null }]));
    // `owners` are whose approved lines make the achievement: the MRs themselves, or for a manager only the manager (their team report); targets still add up the MRs'.
    const figuresOf = (members: ReadonlySet<string>, owners: ReadonlySet<string> = members) => {
      const mine = shares.filter((t) => members.has(t.userId));
      const sel = { userIds: owners, fromMonth, toMonth };
      const has = owners.size > 0 && (members.size > 0 || sold.some((l) => owners.has(l.userId)));
      return {
        targetPaise: mine.length ? mine.reduce((n, t) => n + t.sharePaise, 0) : null,
        achievedPaise: has ? secondaryOfLines(sold, prices, sel).paise : null,
        primaryPaise: primaryOfLines(sold, prices, sel).paise,
      };
    };

    const figureOf = (userId: string) => {
      const members = new Set(scopes.get(userId) ?? []);
      return figuresOf(members, managerIds.includes(userId) ? new Set([userId]) : members);
    };

    const totals = { employees: matching.length, taPaise: 0, daPaise: 0, targetPaise: 0, achievedPaise: 0, primaryPaise: 0 };
    for (const p of matching) {
      totals.taPaise += taDaOf.get(p.id)?.taPaise ?? 0;
      totals.daPaise += taDaOf.get(p.id)?.daPaise ?? 0;
    }
    // Each MR once, however many managers above them are listed.
    const all = figuresOf(new Set(figureIds));
    totals.targetPaise = all.targetPaise ?? 0;
    totals.achievedPaise = all.achievedPaise ?? 0;
    totals.primaryPaise = all.primaryPaise;

    const pageCount = Math.max(1, Math.ceil(matching.length / input.pageSize));
    const slice = matching.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
    // The pending read is remembered, not just the answer (2026-11-27): rows run in parallel, and each used to fetch the same name again.
    const routeNames = new Map<string, Promise<string>>();
    const zoneNames = new Map<string, Promise<string>>();
    const nameOfRoute = (id: string): Promise<string> => {
      if (!routeNames.has(id)) routeNames.set(id, this.territory.getRoute(id).then((r) => r?.name ?? UNKNOWN));
      return routeNames.get(id)!;
    };
    const nameOfZone = async (id: string | null): Promise<string | null> => {
      if (!id) return null;
      if (!zoneNames.has(id)) zoneNames.set(id, this.territory.getZone(id).then((z) => z?.name ?? UNKNOWN));
      return zoneNames.get(id)!;
    };

    // Each row's days first, then every route name in one read (2026-11-27), then the rows.
    const perRow = await Promise.all(
      slice.map(async (p) => {
        const [working, plans, dcrs] = await Promise.all([this.workingDays(p.id, dates), dates.length ? this.planning.listDailyPlanDays(p.id, from, to) : [], dates.length ? this.fieldActivity.getDcrSummary(p.id, range) : []]);
        return { p, working, plans, dcrs };
      }),
    );
    if (this.territory.getRoutes) {
      const allRouteIds = [...new Set(perRow.flatMap((r) => r.plans.flatMap((pl) => pl.routeIds)))].filter((id) => !routeNames.has(id));
      const found = new Map((allRouteIds.length > 0 ? await this.territory.getRoutes(allRouteIds) : []).map((r) => [r.id, r.name]));
      for (const id of allRouteIds) if (found.has(id)) routeNames.set(id, Promise.resolve(found.get(id)!));
    }
    const rows: SalesDashboardRowDto[] = await Promise.all(
      perRow.map(async ({ p, working, plans, dcrs }) => {
        const count = (statusByDate: Map<string, string>): SalesDashboardComplianceDto => {
          let submitted = 0;
          let approved = 0;
          for (const d of working) {
            const s = statusByDate.get(d);
            if (s && SUBMITTED.has(s)) submitted++;
            if (s === 'APPROVED') approved++;
          }
          return { submitted, approved };
        };
        const routeIds = [...new Set(plans.flatMap((pl) => pl.routeIds))];
        const f = figureOf(p.id);
        return {
          employee: { id: p.id, name: p.name, employeeCode: p.employeeCode },
          designation: p.designation,
          zone: await nameOfZone(p.zoneId),
          routes: await Promise.all(routeIds.map(nameOfRoute)),
          workingDays: working.length,
          plan: count(new Map(plans.map((pl) => [pl.date, pl.status]))),
          dcr: count(new Map(dcrs.map((d) => [d.reportDate, d.status]))),
          taPaise: taDaOf.get(p.id)?.taPaise ?? 0,
          daPaise: taDaOf.get(p.id)?.daPaise ?? 0,
          targetPaise: f.targetPaise,
          achievedPaise: f.achievedPaise,
          primaryPaise: f.primaryPaise,
          mrCount: scopes.get(p.id)?.[0] === p.id ? null : (scopes.get(p.id)?.length ?? 0),
          rollupStatus: managerIds.includes(p.id) ? (rollupOf.get(p.id) ?? 'NOT_SUBMITTED') : null,
        };
      }),
    );

    return { from, to, fromMonth, toMonth, rows, totals, page: input.page, pageSize: input.pageSize, total: matching.length, totalPages: pageCount };
  }

  /**
   * Who the reader may see: every active field employee for Admin, Accountant and HR; a manager's downline at the chosen level (not themselves); a field employee
   * with no team, nobody. `userId` narrows it to one person, who must be in a manager's downline whatever the level.
   */
  async audience(actor: { id: string; role: string }, scope: 'direct' | 'indirect' | 'all', userId?: string) {
    if (actor.role === 'ADMIN' || actor.role === 'ACCOUNTANT' || actor.role === 'HR') return this.identity.listFieldEmployees(userId ? [userId] : undefined);
    if (actor.role !== 'FIELD') throw AppError.forbidden();
    const downline = await this.identity.getDownline(actor.id);
    if (downline.length === 0) throw AppError.forbidden('The Sales Dashboard is for managers and Admin.');
    if (userId) {
      if (!downline.some((d) => d.id === userId)) throw AppError.forbidden('That employee is not in your team.');
      return this.identity.listFieldEmployees([userId]);
    }
    const level = downline.filter((d) => scope === 'all' || (scope === 'direct' ? (d.depth ?? 1) === 1 : (d.depth ?? 1) > 1));
    return this.identity.listFieldEmployees(level.map((d) => d.id));
  }

  /** The dates among `dates` that were working days for this employee, from their attendance months. */
  private async workingDays(userId: string, dates: string[]): Promise<string[]> {
    if (dates.length === 0) return [];
    const inRange = new Set(dates);
    const months = await Promise.all(monthsOf(dates).map((m) => this.attendance.getMonth(userId, m)));
    return months.flatMap((m) => m.days.filter((d) => inRange.has(d.date) && !NOT_WORKING.has(d.status)).map((d) => d.date));
  }
}

