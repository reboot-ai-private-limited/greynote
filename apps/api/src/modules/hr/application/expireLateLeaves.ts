import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { LeaveApprovalGrantRepositoryPort } from '../domain/leaveApprovalGrant.repository.port.js';
import type { LeaveRepositoryPort } from '../domain/leave.repository.port.js';
import type { HrCalendar } from './hrCalendar.js';
import { addDays } from '@/shared/time/businessTime.js';

/** How far back the sweep looks: a leave year is at most 366 days, and nothing older can still be open in a useful way. */
const LOOKBACK_DAYS = 366;

/**
 * Rejects leaves still waiting for a decision after their first day has begun (decision-log 2026-10-12): nobody can approve them
 * any more without an Admin exception, and their reserved balance would otherwise sit there for good. A leave with a usable
 * exception is left alone. Rejection goes through the approval module, so the ledger releases the balance. Safe to run any time,
 * and from several servers (a lost race is a no-op).
 */
export class ExpireLateLeaves {
  constructor(
    private readonly leaves: LeaveRepositoryPort,
    private readonly grants: LeaveApprovalGrantRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly calendar: HrCalendar,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Returns how many leaves were rejected. */
  async execute(): Promise<number> {
    const today = await this.calendar.today();
    const started = await this.leaves.listStartingBetween(addDays(today, -LOOKBACK_DAYS), today);
    if (started.length === 0) return 0;
    const open = (await this.approvals.listForRecords('LEAVE', started.map((l) => l.id))).filter((r) => r.status === 'SUBMITTED' || r.status === 'MANAGER_APPROVED');
    let rejected = 0;
    for (const request of open) {
      if (await this.grants.findUsable(request.recordId, this.now())) continue;
      if (await this.approvals.autoReject('LEAVE', request.recordId, 'the leave started before anyone approved it.')) rejected++;
    }
    return rejected;
  }
}
