import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { NamedPerson, TeamDayActivity, TeamDirectoryPort, TeamFieldActivityPort, TeamHrPort, TeamMasterPort, TeamPlanningPort, TeamPlanRoute, TeamRoutesPort, TeamSalesPort } from '../../domain/ports.js';
import { mapInChunks } from '../inChunks.js';
import { makeRouteNamer } from '../planRoutes.js';
import { TeamClock } from '../teamClock.js';
import { activeMembers, type TeamLevel } from '../teamScope.js';

export interface TeamDayQuery {
  date: string;
  scope: TeamLevel;
  userId?: string | undefined;
  /** `PLAN_NOT_APPROVED`, `NO_CALLS`, `REPORT_NOT_SENT`: keep only the people who match. */
  filter?: 'PLAN_NOT_APPROVED' | 'NO_CALLS' | 'REPORT_NOT_SENT' | undefined;
  page: number;
  pageSize: number;
}

export interface TeamDoctorLine {
  id: string;
  name: string;
  /** `true` once a call to this doctor is logged on the day. */
  visited: boolean;
  visitedAt: string | null;
  remarks: string | null;
  geofence: string | null;
}

export interface TeamDayRow {
  user: { id: string; employeeCode: string; name: string; depth: number };
  plan: {
    status: string;
    workingType: string;
    routes: TeamPlanRoute[];
    workWith: NamedPerson[];
    remarks: string | null;
    /** Still the draft the Tour Plan wrote: nobody has sent it. The phone shows its routes as the Tour Plan's and no status. */
    fromTourPlan: boolean;
    /** The day's submit time has passed (for a draft: "Daily plan not submitted"). */
    deadlinePassed: boolean;
  } | null;
  doctors: {
    planned: TeamDoctorLine[];
    /** Doctors called who the plan did not list. */
    alsoVisited: TeamDoctorLine[];
  };
  chemistCalls: number;
  followups: number;
  orders: { count: number; amountPaise: number };
  /** The day's report status (`null`: nothing logged and no report). */
  report: { status: string } | null;
  onLeave: boolean;
  /** Planned doctors, and how many of them were called; `missed` only counts once the day is over. */
  summary: { planned: number; visited: number; missed: number };
}

export interface TeamDayResult extends PaginatedResult<TeamDayRow> {
  date: string;
  /** The day is before today: a doctor not called is `missed`, not "not yet". */
  past: boolean;
  /** Everyone at the level, whatever the filter or page. */
  totals: { people: number; plannedDoctors: number; visitedDoctors: number; plansWaiting: number; /** Same as `plansWaiting`; kept for older phones. */ planNotApproved: number; reportsIn: number; onLeave: number };
}

const APPROVED = new Set(['APPROVED', 'MANAGER_APPROVED']);
/** A plan someone sent that waits for a decision or came back: what a manager acts on. A draft is not one. */
const WAITING = new Set(['SUBMITTED', 'REJECTED', 'REOPENED', 'WITHDRAWN']);
const REPORT_IN = new Set(['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED']);

/**
 * The team board for a day (any day, tomorrow included): per person, where they go (routes by name), which doctors the plan lists by name and
 * which of them were called, what else they did, and where the report stands. Read-only, downline only (403 for anyone else).
 */
export class TeamDayUseCase {
  constructor(
    private readonly directory: TeamDirectoryPort,
    private readonly planning: TeamPlanningPort,
    private readonly routes: TeamRoutesPort,
    private readonly fieldActivity: Pick<TeamFieldActivityPort, 'getDayActivity'>,
    private readonly hr: Pick<TeamHrPort, 'listLeavesForUsers'>,
    private readonly sales: Pick<TeamSalesPort, 'listOrders'>,
    private readonly master: Pick<TeamMasterPort, 'getDoctorNames'>,
    private readonly clock: TeamClock,
  ) {}

  async execute(managerId: string, query: TeamDayQuery): Promise<TeamDayResult> {
    const members = await activeMembers(this.directory, managerId, query.scope, query.userId);
    const ids = members.map((m) => m.id);
    const today = (await this.clock.day()).today;
    const past = query.date < today;
    const deadlinePassed = await this.clock.submitDeadlinePassed(query.date);
    const routesOf = makeRouteNamer(this.routes);

    const [activity, leaves, orders, plans] = await Promise.all([
      this.fieldActivity.getDayActivity(ids, query.date),
      this.hr.listLeavesForUsers(ids, query.date, query.date),
      this.sales.listOrders({ from: query.date, to: query.date, limit: 2000 }),
      mapInChunks(members, (m) => this.planning.getDailyPlanDay(m.id, query.date)),
    ]);
    const activityOf = new Map<string, TeamDayActivity>(activity.map((a) => [a.userId, a]));
    const away = new Set(leaves.filter((l) => l.status !== 'SUBMITTED').map((l) => l.userId));
    const ordersOf = new Map<string, { count: number; amountPaise: number }>();
    const mine = new Set(ids);
    for (const o of orders) {
      if (!mine.has(o.userId) || o.status === 'CANCELLED') continue;
      const row = ordersOf.get(o.userId) ?? { count: 0, amountPaise: 0 };
      row.count += 1;
      row.amountPaise += o.totalAmountPaise;
      ordersOf.set(o.userId, row);
    }
    const doctorIds = [...new Set([...plans.flatMap((p) => p?.doctorIds ?? []), ...activity.flatMap((a) => a.doctorCalls.map((c) => c.doctorId))])];
    const names = new Map((doctorIds.length ? await this.master.getDoctorNames(doctorIds) : []).map((d) => [d.id, d.name]));
    const nameOf = (id: string) => names.get(id) ?? 'Doctor';

    const rows = await mapInChunks(members.map((m, i) => ({ m, day: plans[i] ?? null })), async ({ m, day }): Promise<TeamDayRow> => {
      const a = activityOf.get(m.id);
      const calls = new Map((a?.doctorCalls ?? []).map((c) => [c.doctorId, c]));
      const line = (id: string): TeamDoctorLine => {
        const c = calls.get(id);
        return { id, name: nameOf(id), visited: Boolean(c), visitedAt: c ? c.recordedAt.toISOString() : null, remarks: c?.remarks ?? null, geofence: c?.geofence ?? null };
      };
      const plannedIds = day?.doctorIds ?? [];
      const planned = plannedIds.map(line);
      const alsoVisited = [...calls.keys()].filter((id) => !plannedIds.includes(id)).map(line);
      const visited = planned.filter((d) => d.visited).length;
      return {
        user: { id: m.id, employeeCode: m.employeeCode, name: m.name, depth: m.depth },
        plan: day && { status: day.status, workingType: day.workingType, routes: await routesOf(day.routeIds), workWith: await this.directory.namePeople(day.workWith ?? []), remarks: day.remarks ?? null, fromTourPlan: day.status === 'DRAFT', deadlinePassed },
        doctors: { planned, alsoVisited },
        chemistCalls: a?.chemistCalls.length ?? 0,
        followups: a?.followups ?? 0,
        orders: ordersOf.get(m.id) ?? { count: 0, amountPaise: 0 },
        report: a?.reportStatus ? { status: a.reportStatus } : null,
        onLeave: away.has(m.id),
        summary: { planned: planned.length, visited, missed: past ? planned.length - visited : 0 },
      };
    });

    const waiting = (r: TeamDayRow) => !r.onLeave && !!r.plan && WAITING.has(r.plan.status);
    const totals = {
      people: rows.length,
      plannedDoctors: rows.reduce((n, r) => n + r.summary.planned, 0),
      visitedDoctors: rows.reduce((n, r) => n + r.summary.visited, 0),
      plansWaiting: rows.filter(waiting).length,
      planNotApproved: rows.filter(waiting).length,
      reportsIn: rows.filter((r) => r.report && REPORT_IN.has(r.report.status)).length,
      onLeave: rows.filter((r) => r.onLeave).length,
    };
    const shown = rows.filter((r) => {
      if (query.filter === 'PLAN_NOT_APPROVED') return waiting(r);
      if (query.filter === 'NO_CALLS') return !r.onLeave && r.summary.visited + r.doctors.alsoVisited.length + r.chemistCalls === 0;
      if (query.filter === 'REPORT_NOT_SENT') return !r.onLeave && !(r.report && REPORT_IN.has(r.report.status));
      return true;
    });
    const start = (query.page - 1) * query.pageSize;
    return { ...buildPaginatedResult(shown.slice(start, start + query.pageSize), shown.length, query), date: query.date, past, totals };
  }
}
