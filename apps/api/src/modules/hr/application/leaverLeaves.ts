import { addDays } from '@/shared/time/businessTime.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { LeaveRepositoryPort } from '../domain/leave.repository.port.js';

const OPEN = new Set(['SUBMITTED', 'MANAGER_APPROVED']);
/** A leave can be requested at most this far ahead in practice: a leave year. */
const AHEAD_DAYS = 400;

/**
 * A leaving employee's leave requests that start after their last working day and still wait for a decision (decision-log
 * 2026-10-22). Closing rejects each with the reason, which also gives the pending days back to the balance (the LEAVE ledger runs
 * on the rejection). A leave that starts on or before the last day stays: it covers days they were employed.
 */
export class LeaverLeaves {
  constructor(
    private readonly leaves: LeaveRepositoryPort,
    private readonly approvals: ApprovalsPort,
  ) {}

  private async open(userId: string, lastWorkingDay: string): Promise<string[]> {
    const later = (await this.leaves.listOverlapping(userId, addDays(lastWorkingDay, 1), addDays(lastWorkingDay, AHEAD_DAYS))).filter((l) => l.startDate > lastWorkingDay);
    const requests = await this.approvals.listForRecords('LEAVE', later.map((l) => l.id));
    return requests.filter((r) => OPEN.has(r.status)).map((r) => r.recordId);
  }

  async count(userId: string, lastWorkingDay: string): Promise<number> {
    return (await this.open(userId, lastWorkingDay)).length;
  }

  async close(userId: string, lastWorkingDay: string): Promise<number> {
    let closed = 0;
    for (const id of await this.open(userId, lastWorkingDay)) {
      if (await this.approvals.autoReject('LEAVE', id, `the employee left on ${lastWorkingDay}.`)) closed++;
    }
    return closed;
  }
}
