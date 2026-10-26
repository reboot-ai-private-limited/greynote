import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { NamedPerson, TeamDirectoryPort, TeamPlanningPort, TeamPlanRoute, TeamRoutesPort } from '../../domain/ports.js';
import { mapInChunks } from '../inChunks.js';
import { makeRouteNamer } from '../planRoutes.js';
import { activeMembers, type TeamLevel } from '../teamScope.js';

export interface TeamPlansQuery {
  date: string;
  scope: TeamLevel;
  /** One person, who must be in the downline (403 otherwise). */
  userId?: string | undefined;
  /** A plan status (`DRAFT`, `SUBMITTED`, `MANAGER_APPROVED`, `APPROVED`, `REJECTED`, …) or `NONE` for no plan at all. */
  planStatus?: string | undefined;
  page: number;
  pageSize: number;
}

export interface TeamPlanRow {
  user: { id: string; employeeCode: string; name: string; depth: number };
  dailyPlan: {
    status: string;
    workingType: string;
    routeCount: number;
    /** The day's routes with their names and types (HQ, ex-station, out-station). */
    routes: TeamPlanRoute[];
    /** Who the day is spent with, as `Name (Designation)`. */
    workWithPeople: NamedPerson[];
    doctorCount: number;
    /** The employee changed the day the Monthly Plan wrote. */
    changedFromMonthly: boolean;
  } | null;
  /** The month the date falls in. */
  monthlyPlanStatus: string | null;
}

export interface TeamPlansResult extends PaginatedResult<TeamPlanRow> {
  date: string;
  month: string;
  /** Everyone at the level, by daily-plan status (`NONE` = no plan). */
  counts: Record<string, number>;
}

/** Who has a Daily Plan for a day — any day, including tomorrow — and where each stands. Read-only. */
export class TeamPlansUseCase {
  constructor(
    private readonly directory: TeamDirectoryPort,
    private readonly planning: TeamPlanningPort,
    private readonly routes: TeamRoutesPort,
  ) {}

  async execute(managerId: string, query: TeamPlansQuery): Promise<TeamPlansResult> {
    const month = query.date.slice(0, 7);
    const members = await activeMembers(this.directory, managerId, query.scope, query.userId);
    const routesOf = makeRouteNamer(this.routes);
    const rows = await mapInChunks(members, async (m): Promise<TeamPlanRow> => {
      const [day, monthly] = await Promise.all([
        this.planning.getDailyPlanDay(m.id, query.date),
        this.planning.getMonthlyPlanStatus(m.id, month),
      ]);
      return {
        user: { id: m.id, employeeCode: m.employeeCode, name: m.name, depth: m.depth },
        dailyPlan: day && {
          status: day.status,
          workingType: day.workingType,
          routeCount: day.routeIds.length,
          routes: await routesOf(day.routeIds),
          workWithPeople: await this.directory.namePeople(day.workWith ?? []),
          doctorCount: day.doctorIds.length,
          changedFromMonthly: day.changedFromMonthly ?? false,
        },
        monthlyPlanStatus: monthly,
      };
    });
    const counts: Record<string, number> = {};
    for (const r of rows)
      counts[r.dailyPlan?.status ?? 'NONE'] = (counts[r.dailyPlan?.status ?? 'NONE'] ?? 0) + 1;
    const shown = rows.filter(
      (r) => !query.planStatus || (r.dailyPlan?.status ?? 'NONE') === query.planStatus,
    );
    const start = (query.page - 1) * query.pageSize;
    return {
      ...buildPaginatedResult(shown.slice(start, start + query.pageSize), shown.length, query),
      date: query.date,
      month,
      counts,
    };
  }
}
