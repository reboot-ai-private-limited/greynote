import type { SalesDashboardComplianceDto, SalesDashboardDto, SalesDashboardRowDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { assertTimeZone, businessDate, eachDate } from '@/shared/time/businessTime.js';
import type { AttendancePort, FieldDaysPort, FieldRosterPort, MarketingPort, PlanningPort, TerritoryPort, ZoneNamePort } from '../domain/ports.js';

/** The most days one dashboard read covers. A year's worth would mean a year of attendance for every employee on the page. */
export const SALES_DASHBOARD_MAX_DAYS = 93;

/** Days that are not the employee's to work: they had not joined, or it was a holiday, their weekly off, or approved leave. */
const NOT_WORKING: ReadonlySet<string> = new Set(['BEFORE_JOINING', 'HOLIDAY', 'WEEKLY_OFF', 'LEAVE']);
/** Past the employee and into the approval chain — "submitted" in the sense sign-off B7 counts it. */
const SUBMITTED: ReadonlySet<string> = new Set(['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED']);

const UNKNOWN = '(removed)';

export interface SalesDashboardInput {
  actor: { id: string; role: string };
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
 * "Of N days" counts the employee's working days (attendance), so a holiday or approved leave never makes anyone look late.
 */
export class SalesDashboardReport {
  constructor(
    private readonly identity: FieldRosterPort,
    private readonly planning: PlanningPort,
    private readonly attendance: AttendancePort,
    private readonly fieldActivity: FieldDaysPort,
    private readonly marketing: MarketingPort,
    private readonly territory: TerritoryPort & ZoneNamePort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(input: SalesDashboardInput): Promise<SalesDashboardDto> {
    const zone = await readConfig(this.config, 'BUSINESS_TIMEZONE', (v) => {
      assertTimeZone(v);
      return v;
    });
    const today = businessDate(this.now(), zone);
    const from = input.from;
    const to = input.to < today ? input.to : today;
    if (input.to < from) throw AppError.badRequest('The range ends before it starts.');
    const month = to.slice(0, 7);
    const dates = from <= to ? eachDate(from, to) : [];
    if (dates.length > SALES_DASHBOARD_MAX_DAYS) throw AppError.badRequest(`Pick at most ${SALES_DASHBOARD_MAX_DAYS} days.`);

    const people = await this.audience(input.actor);
    const needle = input.search?.toLowerCase();
    const matching = needle ? people.filter((p) => p.name.toLowerCase().includes(needle) || p.employeeCode.toLowerCase().includes(needle)) : people;
    const ids = matching.map((p) => p.id);

    const range = { from, to };
    const [taDa, figures] = await Promise.all([dates.length ? this.fieldActivity.summarizeTaDaByUser(range) : Promise.resolve([]), this.marketing.listMonthFigures(ids, month)]);
    const taDaOf = new Map(taDa.map((t) => [t.userId, t]));
    const figureOf = new Map(figures.map((f) => [f.userId, f]));

    const totals = { employees: matching.length, taPaise: 0, daPaise: 0, targetPaise: 0, achievedPaise: 0 };
    for (const p of matching) {
      totals.taPaise += taDaOf.get(p.id)?.taPaise ?? 0;
      totals.daPaise += taDaOf.get(p.id)?.daPaise ?? 0;
      totals.targetPaise += figureOf.get(p.id)?.targetPaise ?? 0;
      totals.achievedPaise += figureOf.get(p.id)?.achievedPaise ?? 0;
    }

    const pageCount = Math.max(1, Math.ceil(matching.length / input.pageSize));
    const slice = matching.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
    const routeNames = new Map<string, string>();
    const zoneNames = new Map<string, string>();
    const nameOfRoute = async (id: string): Promise<string> => {
      if (!routeNames.has(id)) routeNames.set(id, (await this.territory.getRoute(id))?.name ?? UNKNOWN);
      return routeNames.get(id)!;
    };
    const nameOfZone = async (id: string | null): Promise<string | null> => {
      if (!id) return null;
      if (!zoneNames.has(id)) zoneNames.set(id, (await this.territory.getZone(id))?.name ?? UNKNOWN);
      return zoneNames.get(id)!;
    };

    const rows: SalesDashboardRowDto[] = await Promise.all(
      slice.map(async (p) => {
        const [working, plans, dcrs] = await Promise.all([this.workingDays(p.id, dates), dates.length ? this.planning.listDailyPlanDays(p.id, from, to) : [], dates.length ? this.fieldActivity.getDcrSummary(p.id, range) : []]);
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
        const f = figureOf.get(p.id);
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
          targetPaise: f?.targetPaise ?? null,
          achievedPaise: f?.achievedPaise ?? null,
        };
      }),
    );

    return { from, to, month, rows, totals, page: input.page, pageSize: input.pageSize, total: matching.length, totalPages: pageCount };
  }

  /** Who the reader may see: every active field employee for Admin; a manager's downline (not themselves); a field employee with no team, nobody. */
  private async audience(actor: { id: string; role: string }) {
    if (actor.role === 'ADMIN') return this.identity.listFieldEmployees();
    if (actor.role !== 'FIELD') throw AppError.forbidden();
    const downline = await this.identity.getDownline(actor.id);
    if (downline.length === 0) throw AppError.forbidden('The Sales Dashboard is for managers and Admin.');
    return this.identity.listFieldEmployees(downline.map((d) => d.id));
  }

  /** The dates among `dates` that were working days for this employee, from their attendance months. */
  private async workingDays(userId: string, dates: string[]): Promise<string[]> {
    if (dates.length === 0) return [];
    const inRange = new Set(dates);
    const months = await Promise.all(monthsOf(dates).map((m) => this.attendance.getMonth(userId, m)));
    return months.flatMap((m) => m.days.filter((d) => inRange.has(d.date) && !NOT_WORKING.has(d.status)).map((d) => d.date));
  }
}

