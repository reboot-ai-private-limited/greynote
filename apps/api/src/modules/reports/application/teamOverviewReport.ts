import type { DcrFiguresDto, SalesDashboardRowDto } from '@greynote/contracts';
import { monthRange } from '@/shared/time/businessTime.js';
import type { AttendancePort, FieldActivityPort } from '../domain/ports.js';
import { counted, figuresOf } from './dcrReport.js';
import type { SalesDashboardReport } from './salesDashboardReport.js';

/** What the month's attendance made of each day, for the days that were the employee's to work or not. */
export interface TeamAttendanceCounts {
  present: number;
  leave: number;
  absent: number;
  strike: number;
  /** Holidays and weekly offs. */
  off: number;
}

export interface TeamOverviewRow extends SalesDashboardRowDto {
  /** Reported days, calls, follow-ups, late days and geofence results for the month (reported days only). */
  field: DcrFiguresDto;
  attendance: TeamAttendanceCounts;
}

export interface TeamOverviewInput {
  actor: { id: string; role: string };
  /** `YYYY-MM`. A month not over yet is read up to today. */
  month: string;
  scope?: 'direct' | 'indirect' | 'all' | undefined;
  userId?: string | undefined;
  search?: string | undefined;
  page: number;
  pageSize: number;
}

export interface TeamOverviewDto {
  month: string;
  from: string;
  to: string;
  rows: TeamOverviewRow[];
  totals: {
    employees: number;
    taPaise: number;
    daPaise: number;
    targetPaise: number;
    achievedPaise: number;
    primaryPaise: number;
  };
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const emptyAttendance = (): TeamAttendanceCounts => ({
  present: 0,
  leave: 0,
  absent: 0,
  strike: 0,
  off: 0,
});

/**
 * A manager's month at a glance, one row per person below them: the Sales Dashboard's columns (working days, plan and daily-report
 * compliance, TA and DA, target against what was entered) plus the field figures (calls, follow-ups, late and unconfirmed) and what the
 * attendance made of their days (present, leave, absent, strike, off). The dashboard decides who the reader may see; this adds columns.
 */
export class TeamOverviewReport {
  constructor(
    private readonly dashboard: SalesDashboardReport,
    private readonly fieldActivity: FieldActivityPort,
    private readonly attendance: AttendancePort,
  ) {}

  async read(input: TeamOverviewInput): Promise<TeamOverviewDto> {
    const { from, to } = monthRange(input.month);
    const board = await this.dashboard.read({
      actor: input.actor,
      scope: input.scope,
      userId: input.userId,
      from,
      to,
      search: input.search,
      page: input.page,
      pageSize: input.pageSize,
    });

    const ids = new Set(board.rows.map((r) => r.employee.id));
    const summaries = ids.size
      ? (await this.fieldActivity.summarizeDcrs({ from, to })).filter(
          (s) => ids.has(s.userId) && s.month === input.month,
        )
      : [];
    const fieldOf = new Map(summaries.map((s) => [s.userId, figuresOf(counted(s))]));
    const rows = await Promise.all(
      board.rows.map(async (r): Promise<TeamOverviewRow> => {
        const days = (await this.attendance.getMonth(r.employee.id, input.month)).days;
        const attendance = emptyAttendance();
        for (const d of days) {
          if (d.status === 'PRESENT') attendance.present += 1;
          else if (d.status === 'LEAVE') attendance.leave += 1;
          else if (d.status === 'ABSENT') attendance.absent += 1;
          else if (d.status === 'STRIKE') attendance.strike += 1;
          else if (d.status === 'HOLIDAY' || d.status === 'WEEKLY_OFF') attendance.off += 1;
        }
        return {
          ...r,
          field:
            fieldOf.get(r.employee.id) ??
            figuresOf(
              counted({
                userId: r.employee.id,
                month: input.month,
                reportedDays: 0,
                lateDays: 0,
                doctorCalls: 0,
                chemistCalls: 0,
                followups: 0,
                geofence: { pass: 0, fail: 0, unverified: 0, override: 0 },
                notInPlan: 0,
                followupsNotInPlan: 0,
                offRouteCalls: 0,
              }),
            ),
          attendance,
        };
      }),
    );
    return {
      month: input.month,
      from: board.from,
      to: board.to,
      rows,
      totals: board.totals,
      page: board.page,
      pageSize: board.pageSize,
      total: board.total,
      totalPages: board.totalPages,
    };
  }
}
