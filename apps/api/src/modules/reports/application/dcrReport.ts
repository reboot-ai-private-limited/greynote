import type { DcrCoverageDto, DcrFiguresDto, DcrMonthDto, DcrMrRowDto, DcrYearReportDto } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import { readBusinessDay, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { businessDate, leaveYearRange, monthRange, parseMonthName } from '@/shared/time/businessTime.js';
import { yearMonths } from '../domain/salesFigures.js';
import type { DcrMonthRow, FieldActivityPort, IdentityPort, MasterPort } from '../domain/ports.js';

const UNKNOWN = '(removed)';

const zero = (): Omit<DcrFiguresDto, 'calls' | 'callsPerDay' | 'unconfirmed'> => ({ reportedDays: 0, lateDays: 0, doctorCalls: 0, chemistCalls: 0, followups: 0, geofence: { pass: 0, fail: 0, unverified: 0, override: 0 }, notInPlan: 0, followupsNotInPlan: 0, offRouteCalls: 0 });

/** The derived figures (calls, calls per day, unconfirmed) from the counted ones. */
export function figuresOf(r: Omit<DcrFiguresDto, 'calls' | 'callsPerDay' | 'unconfirmed'>): DcrFiguresDto {
  const calls = r.doctorCalls + r.chemistCalls;
  return { ...r, calls, callsPerDay: r.reportedDays > 0 ? Math.round((calls / r.reportedDays) * 10) / 10 : null, unconfirmed: r.geofence.fail + r.geofence.unverified };
}

function add(into: ReturnType<typeof zero>, r: Omit<DcrFiguresDto, 'calls' | 'callsPerDay' | 'unconfirmed'>): void {
  into.reportedDays += r.reportedDays;
  into.lateDays += r.lateDays;
  into.doctorCalls += r.doctorCalls;
  into.chemistCalls += r.chemistCalls;
  into.followups += r.followups;
  into.notInPlan += r.notInPlan;
  into.followupsNotInPlan += r.followupsNotInPlan;
  into.offRouteCalls += r.offRouteCalls;
  for (const k of ['pass', 'fail', 'unverified', 'override'] as const) into.geofence[k] += r.geofence[k];
}

const counted = (r: DcrMonthRow) => ({ reportedDays: r.reportedDays, lateDays: r.lateDays, doctorCalls: r.doctorCalls, chemistCalls: r.chemistCalls, followups: r.followups, geofence: { ...r.geofence }, notInPlan: r.notInPlan, followupsNotInPlan: r.followupsNotInPlan, offRouteCalls: r.offRouteCalls });

/**
 * What the field force reported, for the financial year in view (sign-off K28: calls only): per month and per employee the reported days, doctor
 * and chemist calls, follow-ups, calls per reported day, how many days were submitted late and how the server's geofence judged the calls; and,
 * for one employee and month, the assigned doctors they did not call on. Only reported days count (a draft, rejected or withdrawn report does not).
 * Reads only.
 */
export class DcrReport {
  constructor(
    private readonly fieldActivity: FieldActivityPort,
    private readonly master: MasterPort,
    private readonly identity: IdentityPort,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async currentMonth(): Promise<string> {
    const { timeZone: zone, dayStart } = await readBusinessDay(this.config);
    return businessDate(this.now(), zone, dayStart).slice(0, 7);
  }

  async year(input: { year: number }): Promise<DcrYearReportDto> {
    const startMonth = await readConfig(this.config, 'FY_START_MONTH', parseMonthName);
    const range = leaveYearRange(input.year, startMonth);
    const months = yearMonths(range.from);
    const [summaries, current] = await Promise.all([this.fieldActivity.summarizeDcrs(range), this.currentMonth()]);
    const people = await this.identity.getUserSummaries([...new Set(summaries.map((s) => s.userId))]);
    const who = new Map(people.map((p) => [p.id, p]));

    const rows: DcrMrRowDto[] = summaries
      .map((s) => ({ month: s.month, mr: { id: s.userId, name: who.get(s.userId)?.name ?? UNKNOWN, employeeCode: who.get(s.userId)?.employeeCode ?? '' }, ...figuresOf(counted(s)) }))
      .sort((a, b) => a.month.localeCompare(b.month) || a.mr.name.localeCompare(b.mr.name));

    const totals = zero();
    const monthRows: DcrMonthDto[] = months.map((month) => {
      const f = zero();
      const inMonth = summaries.filter((s) => s.month === month);
      for (const s of inMonth) add(f, counted(s));
      add(totals, f);
      return { month, state: month > current ? 'FUTURE' : month === current ? 'OPEN' : 'ENDED', employees: inMonth.length, ...figuresOf(f) };
    });
    return { year: input.year, months: monthRows, rows, totals: figuresOf(totals) };
  }

  async coverage(input: { userId: string; month: string }): Promise<DcrCoverageDto> {
    const [mr] = await this.identity.getUserSummaries([input.userId]);
    if (!mr) throw AppError.notFound();
    const [assigned, calledIds] = await Promise.all([this.master.listAssignedDoctors(input.userId), this.fieldActivity.listCalledDoctorIds(input.userId, monthRange(input.month))]);
    const called = new Set(calledIds);
    const notVisited = assigned.filter((d) => !called.has(d.id)).sort((a, b) => a.specialty.localeCompare(b.specialty) || a.name.localeCompare(b.name));
    return { month: input.month, mr: { id: mr.id, name: mr.name, employeeCode: mr.employeeCode }, assigned: assigned.length, visited: assigned.length - notVisited.length, notVisited };
  }
}
