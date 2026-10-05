import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { LeaveRepositoryPort } from '../domain/leave.repository.port.js';
import type { Probation } from './probation.js';

/** Behind the public contract — read from each leave's stored days, not recomputed. */
export class LeaveLookups {
  constructor(
    private readonly leaves: LeaveRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly probation: Probation,
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
