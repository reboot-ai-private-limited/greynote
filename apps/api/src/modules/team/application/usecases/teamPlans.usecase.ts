import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { TeamDirectoryPort, TeamPlanningPort } from '../../domain/ports.js';
import { mapInChunks } from '../inChunks.js';
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
    doctorCount: number;
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
  ) {}

  async execute(managerId: string, query: TeamPlansQuery): Promise<TeamPlansResult> {
    const month = query.date.slice(0, 7);
    const members = await activeMembers(this.directory, managerId, query.scope, query.userId);
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
          doctorCount: day.doctorIds.length,
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
