import { narrowToTeam } from '@/shared/access/teamScope.js';
import type { TeamAttendancePort, TeamDirectoryPort } from '../../domain/ports.js';

/** One team member's month, one status per day (present, leave, absent, strike, off, holiday…), for the calendar. Downline only (403 otherwise). */
export class TeamMemberAttendanceUseCase {
  constructor(
    private readonly directory: TeamDirectoryPort,
    private readonly attendance: TeamAttendancePort,
  ) {}

  async execute(managerId: string, userId: string, month: string) {
    narrowToTeam((await this.directory.getDownline(managerId)).map((m) => m.id), userId);
    const m = await this.attendance.getMonth(userId, month);
    return { userId: m.userId, month: m.month, days: m.days, counts: m.counts };
  }
}
