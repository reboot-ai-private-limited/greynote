import { narrowToTeam } from '@/shared/access/teamScope.js';
import { monthRange } from '@/shared/time/businessTime.js';
import type { NamedPerson, TeamDirectoryPort, TeamFieldActivityPort, TeamMasterPort, TeamPlanningPort, TeamPlanRoute, TeamRoutesPort } from '../../domain/ports.js';
import { makeRouteNamer } from '../planRoutes.js';
import { TeamClock } from '../teamClock.js';
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
  report: { status: string; doctorCalls: number; chemistCalls: number; followups: number } | null;
  summary: { planned: number; visited: number; missed: number };
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

    const items: TeamMemberDay[] = [];
    for (const date of dates) {
      const p = planOf.get(date);
      const a = activityOf.get(date);
      const calls = new Map((a?.doctorCalls ?? []).map((c) => [c.doctorId, c]));
      const line = (id: string): TeamDoctorLine => {
        const c = calls.get(id);
        return { id, name: names.get(id) ?? 'Doctor', visited: Boolean(c), visitedAt: c ? c.recordedAt.toISOString() : null, remarks: c?.remarks ?? null, geofence: c?.geofence ?? null };
      };
      const planned = (p?.doctorIds ?? []).map(line);
      const alsoVisited = [...calls.keys()].filter((id) => !(p?.doctorIds ?? []).includes(id)).map(line);
      const visited = planned.filter((d) => d.visited).length;
      items.push({
        date,
        plan: p ? { status: p.status, workingType: p.workingType, routes: await routesOf(p.routeIds), workWith: await this.directory.namePeople(p.workWith), remarks: p.remarks, changedFromMonthly: p.changedFromMonthly } : null,
        doctors: { planned, alsoVisited },
        report: a?.reportStatus ? { status: a.reportStatus, doctorCalls: a.doctorCalls.length, chemistCalls: a.chemistCalls.length, followups: a.followups } : null,
        summary: { planned: planned.length, visited, missed: date < today ? planned.length - visited : 0 },
      });
    }
    return { month, monthlyPlanStatus: monthly, items };
  }
}
