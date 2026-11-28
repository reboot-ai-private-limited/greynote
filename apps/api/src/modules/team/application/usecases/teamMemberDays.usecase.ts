import { narrowToTeam } from '@/shared/access/teamScope.js';
import { carryByDay, type CarryRow } from '@/shared/carryOver/carryByDay.js';
import { AppError } from '@/shared/errors/AppError.js';
import { monthRange } from '@/shared/time/businessTime.js';
import type { NamedPerson, TeamDirectoryPort, TeamFieldActivityPort, TeamMasterPort, TeamPlanningPort, TeamPlanRoute, TeamRoutesPort } from '../../domain/ports.js';
import { makeRouteNamer } from '../planRoutes.js';
import type { TeamClock } from '../teamClock.js';
import type { TeamDoctorLine } from './teamDay.usecase.js';

export interface TeamMemberDay {
  date: string;
  plan: {
    status: string;
    workingType: string;
    routes: TeamPlanRoute[];
    workWith: NamedPerson[];
    remarks: string | null;
    changedFromMonthly: boolean;
  } | null;
  doctors: { planned: TeamDoctorLine[]; alsoVisited: TeamDoctorLine[] };
  /** The day's report: status and what it holds. `null` when nothing was logged. */
  report: { /** The report's id (2026-11-28), to open it. */ id?: string | null; status: string; doctorCalls: number; chemistCalls: number; followups: number } | null;
  summary: { planned: number; visited: number; missed: number };
  /** Doctors carried in (owed when the day started), missed that day and carried on to the next day; `null` for a day after today. On today the figures are so far. */
  carry: { carriedIn: number; missed: number; carriedOn: number; final: boolean } | null;
}

/** One day for a manager: what was planned, visited, missed and carried (doctors by name), and the month so far. */
export interface TeamMemberDayDetail {
  date: string;
  /** The day is over, so the carry-on is settled; on today it is "so far". */
  final: boolean;
  report: { status: string } | null;
  planned: TeamDoctorLine[];
  alsoVisited: TeamDoctorLine[];
  missedToday: Array<{ id: string; name: string }>;
  carriedIn: Array<{ id: string; name: string; since: string }>;
  carriedOn: Array<{ id: string; name: string; since: string }>;
  /** From the 1st to this day: doctor calls on sent reports, doctor-days missed, doctors still carried at this day's end. */
  month: { doctorCalls: number; missedDays: number; carriedNow: number };
}

export interface TeamMemberDaysResult {
  month: string;
  /** The monthly plan's status, so the phone can say "not approved yet". */
  monthlyPlanStatus: string | null;
  items: TeamMemberDay[];
}

/**
 * One person's month, day by day, newest first: the plan (routes by name, doctors by name, remarks, status) and what happened (the report, which
 * doctors were called). A running month is read up to tomorrow. Downline only (403 otherwise).
 */
const REPORT_IN = ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED'];
const PLAN_APPROVED = ['APPROVED', 'MANAGER_APPROVED'];

export class TeamMemberDaysUseCase {
  constructor(
    private readonly directory: TeamDirectoryPort,
    private readonly planning: TeamPlanningPort,
    private readonly routes: TeamRoutesPort,
    private readonly fieldActivity: Pick<TeamFieldActivityPort, 'getActivityRange'>,
    private readonly master: Pick<TeamMasterPort, 'getDoctorNames'>,
    private readonly clock: TeamClock,
  ) {}

  async execute(managerId: string, userId: string, month: string): Promise<TeamMemberDaysResult> {
    const downline = await this.directory.getDownline(managerId);
    narrowToTeam(downline.map((m) => m.id), userId);
    const range = monthRange(month);
    const today = (await this.clock.day()).today;
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const to = range.to < tomorrow ? range.to : tomorrow;
    if (range.from > to) return { month, monthlyPlanStatus: await this.planning.getMonthlyPlanStatus(userId, month), items: [] };

    const [plans, activity, monthly] = await Promise.all([
      this.planning.listDailyPlanDays ? this.planning.listDailyPlanDays(userId, range.from, to) : Promise.resolve([]),
      this.fieldActivity.getActivityRange(userId, { from: range.from, to }),
      this.planning.getMonthlyPlanStatus(userId, month),
    ]);
    const activityOf = new Map(activity.map((a) => [a.date, a]));
    const planOf = new Map(plans.map((p) => [p.date, p]));
    const dates = [...new Set([...planOf.keys(), ...activityOf.keys()])].sort().reverse();
    const doctorIds = [...new Set([...plans.flatMap((p) => p.doctorIds), ...activity.flatMap((a) => a.doctorCalls.map((c) => c.doctorId))])];
    const names = new Map((doctorIds.length ? await this.master.getDoctorNames(doctorIds) : []).map((d) => [d.id, d.name]));
    const routesOf = makeRouteNamer(this.routes);
    const carryOf = this.carryRows(dates, planOf, activityOf, today);

    const items: TeamMemberDay[] = [];
    for (const date of dates) {
      const p = planOf.get(date);
      const a = activityOf.get(date);
      const calls = new Map((a?.doctorCalls ?? []).map((c) => [c.doctorId, c]));
      const line = (id: string): TeamDoctorLine => {
        const c = calls.get(id);
        return { id, name: names.get(id) ?? 'Doctor', visited: Boolean(c), visitedAt: c ? c.recordedAt.toISOString() : null, remarks: c?.remarks ?? null, geofence: c?.geofence ?? null, samples: c?.samples ?? [], lbl: c?.lbl ?? [] };
      };
      const planned = (p?.doctorIds ?? []).map(line);
      const alsoVisited = [...calls.keys()].filter((id) => !(p?.doctorIds ?? []).includes(id)).map(line);
      const visited = planned.filter((d) => d.visited).length;
      items.push({
        date,
        plan: p ? { status: p.status, workingType: p.workingType, routes: await routesOf(p.routeIds), workWith: await this.directory.namePeople(p.workWith), remarks: p.remarks, changedFromMonthly: p.changedFromMonthly } : null,
        doctors: { planned, alsoVisited },
        report: a?.reportStatus ? { id: a.dcrId ?? null, status: a.reportStatus, doctorCalls: a.doctorCalls.length, chemistCalls: a.chemistCalls.length, followups: a.followups } : null,
        summary: { planned: planned.length, visited, missed: date < today ? planned.length - visited : 0 },
        carry: carryOf.has(date) ? { carriedIn: carryOf.get(date)!.carriedIn.length, missed: carryOf.get(date)!.missed.length, carriedOn: carryOf.get(date)!.carriedOn.length, final: date < today } : null,
      });
    }
    return { month, monthlyPlanStatus: monthly, items };
  }

  /** The carry-over of the month up to today, from the one shared calculation: approved Daily Plans and sent reports only. */
  private carryRows(
    dates: readonly string[],
    planOf: Map<string, { status: string; doctorIds: string[] }>,
    activityOf: Map<string, { reportStatus: string | null; doctorCalls: Array<{ doctorId: string }> }>,
    today: string,
  ): Map<string, CarryRow> {
    const counted = [...dates].filter((d) => d <= today).sort();
    return new Map(
      carryByDay(
        counted.map((date) => {
          const p = planOf.get(date);
          const a = activityOf.get(date);
          return { date, plannedIds: p && PLAN_APPROVED.includes(p.status) ? p.doctorIds : [], calledIds: a?.reportStatus && REPORT_IN.includes(a.reportStatus) ? a.doctorCalls.map((c) => c.doctorId) : [] };
        }),
      ).map((r) => [r.date, r]),
    );
  }

  /** One day of one person, in doctors: planned, visited, missed, carried in (since when) and carried on, with the month so far. Downline only (403 otherwise). */
  async day(managerId: string, userId: string, date: string): Promise<TeamMemberDayDetail> {
    const downline = await this.directory.getDownline(managerId);
    narrowToTeam(downline.map((m) => m.id), userId);
    const today = (await this.clock.day()).today;
    if (date > today) throw AppError.badRequest('That day has not happened yet.');
    const month = date.slice(0, 7);
    const range = monthRange(month);
    const [plans, activity] = await Promise.all([
      this.planning.listDailyPlanDays ? this.planning.listDailyPlanDays(userId, range.from, date) : Promise.resolve([]),
      this.fieldActivity.getActivityRange(userId, { from: range.from, to: date }),
    ]);
    const planOf = new Map(plans.map((p) => [p.date, p]));
    const activityOf = new Map(activity.map((a) => [a.date, a]));
    const dates = [...new Set([...planOf.keys(), ...activityOf.keys(), date])];
    const carryOf = this.carryRows(dates, planOf, activityOf, date);
    const row = carryOf.get(date)!;
    const ids = [...new Set([...(planOf.get(date)?.doctorIds ?? []), ...(activityOf.get(date)?.doctorCalls.map((c) => c.doctorId) ?? []), ...row.carriedIn.map((c) => c.id), ...row.carriedOn.map((c) => c.id)])];
    const names = new Map((ids.length ? await this.master.getDoctorNames(ids) : []).map((d) => [d.id, d.name]));
    const nameOf = (id: string) => names.get(id) ?? 'Doctor';
    const a = activityOf.get(date);
    const calls = new Map((a?.doctorCalls ?? []).map((c) => [c.doctorId, c]));
    const line = (id: string): TeamDoctorLine => {
      const c = calls.get(id);
      return { id, name: nameOf(id), visited: Boolean(c), visitedAt: c ? c.recordedAt.toISOString() : null, remarks: c?.remarks ?? null, geofence: c?.geofence ?? null, samples: c?.samples ?? [], lbl: c?.lbl ?? [] };
    };
    const planIds = planOf.get(date)?.doctorIds ?? [];
    let doctorCalls = 0;
    let missedDays = 0;
    for (const [d, r] of carryOf) {
      const act = activityOf.get(d);
      if (act?.reportStatus && REPORT_IN.includes(act.reportStatus)) doctorCalls += act.doctorCalls.length;
      missedDays += r.missed.length;
    }
    return {
      date,
      final: date < today,
      report: a?.reportStatus ? { status: a.reportStatus } : null,
      planned: planIds.map(line),
      alsoVisited: [...calls.keys()].filter((id) => !planIds.includes(id)).map(line),
      missedToday: row.missed.map((id) => ({ id, name: nameOf(id) })),
      carriedIn: row.carriedIn.map((c) => ({ ...c, name: nameOf(c.id) })),
      carriedOn: row.carriedOn.map((c) => ({ ...c, name: nameOf(c.id) })),
      month: { doctorCalls, missedDays, carriedNow: row.carriedOn.length },
    };
  }
}
