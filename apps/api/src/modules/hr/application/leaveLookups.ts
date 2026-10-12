import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { LeaveRepositoryPort } from '../domain/leave.repository.port.js';
import type { LeaveTypeRepositoryPort } from '../domain/leaveType.repository.port.js';
import type { TeamLeave } from '../hr.public.js';
import type { Probation } from './probation.js';

/** The most leaves one team-calendar read looks at: a team's leaves in a month or two are far fewer. */
const TEAM_LEAVE_CAP = 2000;

/** Behind the public contract — read from each leave's stored days, not recomputed. */
export class LeaveLookups {
  constructor(
    private readonly leaves: LeaveRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly probation: Probation,
    private readonly leaveTypes: LeaveTypeRepositoryPort,
  ) {}

  /** PRD §7.5: a Manager-Approved (or fully approved) leave covers this day. */
  async isOnLeave(userId: string, date: string): Promise<boolean> {
    for (const leave of await this.leaves.listOverlapping(userId, date, date)) {
      if (!leave.days.some((d) => d.date === date)) continue;
      const status = (await this.approvals.getForRecord('LEAVE', leave.id))?.status;
      if (status === 'MANAGER_APPROVED' || status === 'APPROVED') return true;
    }
    return false;
  }

  /**
   * The days in a range covered by a Manager-Approved (or fully approved) leave — the same rule as `isOnLeave`, in one pass for a
   * calendar. Sorted, no duplicates.
   */
  async leaveDates(userId: string, from: string, to: string): Promise<string[]> {
    const dates = new Set<string>();
    for (const leave of await this.leaves.listOverlapping(userId, from, to)) {
      const status = (await this.approvals.getForRecord('LEAVE', leave.id))?.status;
      if (status !== 'MANAGER_APPROVED' && status !== 'APPROVED') continue;
      for (const day of leave.days) if (day.date >= from && day.date <= to) dates.add(day.date);
    }
    return [...dates].sort();
  }

  /**
   * These people's leaves that touch [from, to] and are still alive (waiting on the manager, manager-approved or approved; rejected and
   * withdrawn are left out), oldest start first. For a manager's team calendar.
   */
  async leavesForUsers(userIds: string[], from: string, to: string): Promise<TeamLeave[]> {
    if (userIds.length === 0) return [];
    const { items } = await this.leaves.list({ userIds, from, to }, { page: 1, pageSize: TEAM_LEAVE_CAP });
    const [requests, types] = await Promise.all([this.approvals.listForRecords('LEAVE', items.map((l) => l.id)), this.leaveTypes.list()]);
    const statusOf = new Map(requests.map((r) => [r.recordId, r.status]));
    const typeName = new Map(types.map((t) => [t.id, t.name as string]));
    return items
      .flatMap((l) => {
        const status = statusOf.get(l.id);
        if (status !== 'SUBMITTED' && status !== 'MANAGER_APPROVED' && status !== 'APPROVED') return [];
        return [{ leaveId: l.id, userId: l.userId, leaveType: typeName.get(l.leaveTypeId) ?? null, startDate: l.startDate, endDate: l.endDate, half: l.half, daysCount: l.daysCount, status }];
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.userId.localeCompare(b.userId));
  }

  /** Payroll: approved unpaid days falling in `month` (`YYYY-MM`). Days inside the employee's probation are paid, so they don't count. */
  async unpaidDays(userId: string, month: string): Promise<number> {
    let total = 0;
    const probationEnd = await this.probation.endsOn(userId);
    for (const leave of await this.leaves.listOverlapping(userId, `${month}-01`, `${month}-31`)) {
      if (leave.isPaid) continue;
      if ((await this.approvals.getForRecord('LEAVE', leave.id))?.status !== 'APPROVED') continue;
      total += leave.days.filter((d) => d.date.startsWith(`${month}-`) && !(probationEnd && d.date < probationEnd)).reduce((sum, d) => sum + d.portion, 0);
    }
    return total;
  }
}
