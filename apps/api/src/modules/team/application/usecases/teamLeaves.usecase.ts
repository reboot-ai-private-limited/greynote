import { AppError } from '@/shared/errors/AppError.js';
import { addDays } from '@/shared/time/businessTime.js';
import type { TeamDirectoryPort, TeamHrPort, TeamLeaveEntry } from '../../domain/ports.js';
import { activeMembers, type TeamLevel } from '../teamScope.js';

/** The longest window one calendar read covers. */
export const MAX_LEAVE_WINDOW_DAYS = 93;

export interface TeamLeavesQuery {
  from: string;
  to: string;
  scope: TeamLevel;
  /** One person, who must be in the downline (403 otherwise). */
  userId?: string | undefined;
  /** Leaves still waiting on the manager, or already past them. */
  status?: 'SUBMITTED' | 'MANAGER_APPROVED' | 'APPROVED' | undefined;
}

export interface TeamLeaveRow extends TeamLeaveEntry {
  user: { id: string; employeeCode: string; name: string; depth: number };
}

/** Who on the team is away, or has asked to be, in a date window. A team calendar, not a list of requests to decide (those are in Approvals). */
export class TeamLeavesUseCase {
  constructor(
    private readonly directory: TeamDirectoryPort,
    private readonly hr: TeamHrPort,
  ) {}

  async execute(
    managerId: string,
    query: TeamLeavesQuery,
  ): Promise<{ from: string; to: string; items: TeamLeaveRow[] }> {
    if (query.to < query.from)
      throw AppError.badRequest('The end of the range is before its start.', { field: 'to' });
    if (query.to > addDays(query.from, MAX_LEAVE_WINDOW_DAYS - 1))
      throw AppError.badRequest(`Ask for at most ${MAX_LEAVE_WINDOW_DAYS} days at a time.`, {
        field: 'to',
      });

    const members = await activeMembers(this.directory, managerId, query.scope, query.userId);
    const who = new Map(members.map((m) => [m.id, m]));
    const leaves = await this.hr.listLeavesForUsers([...who.keys()], query.from, query.to);
    const items = leaves
      .filter((l) => !query.status || l.status === query.status)
      .flatMap((l) => {
        const m = who.get(l.userId);
        return m
          ? [
              {
                ...l,
                user: { id: m.id, employeeCode: m.employeeCode, name: m.name, depth: m.depth },
              },
            ]
          : [];
      });
    return { from: query.from, to: query.to, items };
  }
}
