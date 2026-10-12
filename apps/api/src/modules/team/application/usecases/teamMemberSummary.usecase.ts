import type { TeamOverviewRow } from '@/modules/reports/reports.public.js';
import type { TeamOverviewPort } from '../../domain/ports.js';
import type { TeamClock } from '../teamClock.js';
import type { ListTeamMembersUseCase, TeamMemberRow } from './listTeamMembers.usecase.js';
import type { TeamTodayRow, TeamTodayUseCase } from './teamToday.usecase.js';

export interface TeamMemberSummary {
  member: TeamMemberRow;
  /** Their day, today (the same row `/team/today` gives). */
  date: string;
  today: TeamTodayRow | null;
  /** The month the figures below cover (`YYYY-MM`). */
  month: string;
  /** The Team Overview row for that month; `null` for someone who is no longer an active field employee. */
  overview: TeamOverviewRow | null;
}

/**
 * The person page: who they are, how today stands, and their month — the same figures the list screens give, for one person, in one read.
 * The deeper lists (their plans, reports, expenses, leave, doctors) are the existing team routes with this person's id.
 */
export class TeamMemberSummaryUseCase {
  constructor(
    private readonly members: ListTeamMembersUseCase,
    private readonly today: TeamTodayUseCase,
    private readonly overview: TeamOverviewPort,
    private readonly clock: TeamClock,
  ) {}

  async execute(managerId: string, userId: string, month?: string): Promise<TeamMemberSummary> {
    // Every read below refuses a person outside the downline, so the first one to run is the access check.
    const [{ items: found }, day] = await Promise.all([
      this.members.execute(managerId, {
        userId,
        scope: 'all',
        status: 'all',
        page: 1,
        pageSize: 1,
      }),
      this.clock.day(),
    ]);
    const member = found[0] as TeamMemberRow;
    const forMonth = month ?? day.today.slice(0, 7);
    const [today, overview] = await Promise.all([
      this.today.execute(managerId, { userId, scope: 'all', page: 1, pageSize: 1 }),
      this.overview.readTeamOverview({
        actor: { id: managerId, role: 'FIELD' },
        month: forMonth,
        userId,
        page: 1,
        pageSize: 1,
      }),
    ]);
    return {
      member,
      date: today.date,
      today: today.items[0] ?? null,
      month: forMonth,
      overview: overview.rows[0] ?? null,
    };
  }
}
