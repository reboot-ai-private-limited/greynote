import { AppError } from '@/shared/errors/AppError.js';
import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type {
  TeamBlockPort,
  TeamDirectoryPort,
  TeamFieldActivityPort,
  TeamHrPort,
  TeamLeaveEntry,
  TeamPlanningPort,
} from '../../domain/ports.js';
import { mapInChunks } from '../inChunks.js';
import { activeMembers, type TeamLevel } from '../teamScope.js';
import type { TeamClock } from '../teamClock.js';

/** Where one person stands on the day, in the order a manager cares about. */
export const DAY_STATES = [
  'NOT_STARTED',
  'MISSED',
  'WORKING',
  'NOT_YET',
  'REPORTED',
  'ON_LEAVE',
  'OFF',
] as const;
export type DayState = (typeof DAY_STATES)[number];

const QUALIFYING = new Set(['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED']);
const COVERING = new Set(['MANAGER_APPROVED', 'APPROVED']);

export interface TeamTodayQuery {
  /** A business day, today or earlier; today when omitted. */
  date?: string | undefined;
  scope: TeamLevel;
  /** One person, who must be in the downline (403 otherwise). */
  userId?: string | undefined;
  state?: DayState | undefined;
  /** Only people who need the manager's eye: blocked, not started, missed, or without a plan on a working day. */
  attention?: boolean | undefined;
  page: number;
  pageSize: number;
}

export interface TeamTodayRow {
  user: { id: string; employeeCode: string; name: string; depth: number };
  state: DayState;
  plan: { status: string; workingType: string; routeCount: number; doctorCount: number } | null;
  dcr: { status: string; doctorCalls: number; chemistCalls: number; followups: number } | null;
  leave: {
    leaveId: string;
    leaveType: string | null;
    status: TeamLeaveEntry['status'];
    startDate: string;
    endDate: string;
  } | null;
  blocked: boolean;
  attention: boolean;
}

export interface TeamTodayResult extends PaginatedResult<TeamTodayRow> {
  date: string;
  /** The time after which no activity reads as "not started" (today only). */
  notStartedAfter: string;
  tiles: Record<DayState, number> & {
    total: number;
    blocked: number;
    noPlan: number;
    attention: number;
  };
}

/**
 * The Team screen's home: for each active person below the manager, what they did on a day — planned, started, reported, on
 * leave, off, blocked. The tiles count everyone at the chosen level; the rows are filtered and paged. Read-only, computed live.
 */
export class TeamTodayUseCase {
  constructor(
    private readonly directory: TeamDirectoryPort,
    private readonly blocks: TeamBlockPort,
    private readonly planning: TeamPlanningPort,
    private readonly fieldActivity: TeamFieldActivityPort,
    private readonly hr: TeamHrPort,
    private readonly clock: TeamClock,
  ) {}

  async execute(managerId: string, query: TeamTodayQuery): Promise<TeamTodayResult> {
    const day = await this.clock.day();
    const date = query.date ?? day.today;
    if (date > day.today)
      throw AppError.badRequest('That day has not happened yet.', { field: 'date' });

    const members = await activeMembers(this.directory, managerId, query.scope, query.userId);
    const leaves = await this.hr.listLeavesForUsers(
      members.map((m) => m.id),
      date,
      date,
    );
    const leaveOf = new Map<string, TeamLeaveEntry>();
    for (const l of leaves) {
      const held = leaveOf.get(l.userId);
      // A leave that already covers the day outranks one still waiting.
      if (!held || (COVERING.has(l.status) && !COVERING.has(held.status))) leaveOf.set(l.userId, l);
    }

    const rows = await mapInChunks(members, async (m): Promise<TeamTodayRow> => {
      const [plan, dcrs, off, blocked] = await Promise.all([
        this.planning.getDailyPlanDay(m.id, date),
        this.fieldActivity.getDcrSummary(m.id, { from: date, to: date }),
        this.hr.listOffDates(m.id, date, date),
        this.blocks.isBlocked(m.id),
      ]);
      const dcr = dcrs[0] ?? null;
      const leave = leaveOf.get(m.id) ?? null;
      const records = dcr ? dcr.doctorCalls + dcr.chemistCalls + dcr.followups : 0;
      const state = stateOf({
        dcr,
        records,
        onLeave: leave !== null && COVERING.has(leave.status),
        off: off.includes(date),
        isToday: date === day.today,
        pastThreshold: day.pastThreshold,
      });
      const planMissing = plan === null && state !== 'ON_LEAVE' && state !== 'OFF';
      return {
        user: { id: m.id, employeeCode: m.employeeCode, name: m.name, depth: m.depth },
        state,
        plan: plan && {
          status: plan.status,
          workingType: plan.workingType,
          routeCount: plan.routeIds.length,
          doctorCount: plan.doctorIds.length,
        },
        dcr: dcr && {
          status: dcr.status,
          doctorCalls: dcr.doctorCalls,
          chemistCalls: dcr.chemistCalls,
          followups: dcr.followups,
        },
        leave: leave && {
          leaveId: leave.leaveId,
          leaveType: leave.leaveType,
          status: leave.status,
          startDate: leave.startDate,
          endDate: leave.endDate,
        },
        blocked,
        attention: blocked || state === 'NOT_STARTED' || state === 'MISSED' || planMissing,
      };
    });

    const tiles = {
      total: rows.length,
      blocked: 0,
      noPlan: 0,
      attention: 0,
      ...Object.fromEntries(DAY_STATES.map((s) => [s, 0])),
    } as TeamTodayResult['tiles'];
    for (const r of rows) {
      tiles[r.state] += 1;
      if (r.blocked) tiles.blocked += 1;
      if (r.attention) tiles.attention += 1;
      if (r.plan === null && r.state !== 'ON_LEAVE' && r.state !== 'OFF') tiles.noPlan += 1;
    }

    const shown = rows
      .filter((r) => (!query.state || r.state === query.state) && (!query.attention || r.attention))
      .sort(
        (a, b) =>
          Number(b.attention) - Number(a.attention) ||
          DAY_STATES.indexOf(a.state) - DAY_STATES.indexOf(b.state) ||
          a.user.depth - b.user.depth ||
          a.user.name.localeCompare(b.user.name),
      );
    const start = (query.page - 1) * query.pageSize;
    return {
      ...buildPaginatedResult(shown.slice(start, start + query.pageSize), shown.length, query),
      date,
      notStartedAfter: day.notStartedAfter,
      tiles,
    };
  }
}

function stateOf(f: {
  dcr: { status: string } | null;
  records: number;
  onLeave: boolean;
  off: boolean;
  isToday: boolean;
  pastThreshold: boolean;
}): DayState {
  if (f.dcr && QUALIFYING.has(f.dcr.status)) return 'REPORTED';
  if (f.records > 0) return 'WORKING';
  if (f.onLeave) return 'ON_LEAVE';
  if (f.off) return 'OFF';
  if (!f.isToday) return 'MISSED';
  return f.pastThreshold ? 'NOT_STARTED' : 'NOT_YET';
}
