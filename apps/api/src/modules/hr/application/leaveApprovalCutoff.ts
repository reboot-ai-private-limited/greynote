import { parsePositiveInt, readConfigOr, type ConfigReader } from '@/shared/config/readConfig.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { LeaveApprovalGrant } from '../domain/leaveApprovalGrant.entity.js';
import type { LeaveApprovalGrantRepositoryPort } from '../domain/leaveApprovalGrant.repository.port.js';
import type { LeaveRepositoryPort } from '../domain/leave.repository.port.js';
import type { Actor } from './actor.js';
import type { HrCalendar } from './hrCalendar.js';

/**
 * A leave can only be approved until its first day (decision-log 2026-10-12): once that day has begun the cutoff has passed, and
 * only an Admin exception lets it through. Nothing here stops a request (backdating is its own limit) or a rejection/withdrawal.
 */
export class LeaveApprovalCutoff {
  constructor(
    private readonly leaves: LeaveRepositoryPort,
    private readonly grants: LeaveApprovalGrantRepositoryPort,
    private readonly calendar: HrCalendar,
    private readonly config: ConfigReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Inside the approval transaction: throws (rolling the approval back) when the leave has started and no usable exception exists. */
  async assertMayApprove(leave: { id: string; startDate: string }, ctx: TransactionContext): Promise<void> {
    if (leave.startDate >= (await this.calendar.today())) return;
    const now = this.now();
    const grant = await this.grants.findUsable(leave.id, now);
    if (!grant) {
      throw AppError.conflict('This leave has already started, so it can no longer be approved. Reject it, or ask Admin to allow it.', { code: 'LEAVE_APPROVAL_LATE' });
    }
    if (!(await this.grants.consume(grant.id, now, ctx))) {
      throw AppError.conflict('That exception was used or ended just now. Try again.', { code: 'LEAVE_APPROVAL_LATE' });
    }
  }

  /** Admin lets one leave be approved after its start date, once, before `expiresAt` (default `LATE_LEAVE_GRANT_VALID_HOURS` from now). */
  async grant(actor: Actor, leaveId: string, input: { reason: string; expiresAt?: Date | undefined }): Promise<LeaveApprovalGrant> {
    if (actor.role !== 'ADMIN') throw AppError.forbidden('Only Admin can allow a late leave approval.');
    const leave = await this.leaves.findById(leaveId);
    if (!leave) throw AppError.notFound('No such leave.');
    const now = this.now();
    const grant = await this.grants.create(
      { leaveId, userId: leave.userId, reason: input.reason, grantedBy: actor.id, grantedAt: now, expiresAt: await this.expiry(now, input.expiresAt) },
      now,
    );
    if (!grant) throw AppError.conflict('There’s already an open exception for this leave.');
    return grant;
  }

  async revoke(actor: Actor, leaveId: string): Promise<LeaveApprovalGrant> {
    if (actor.role !== 'ADMIN') throw AppError.forbidden('Only Admin can withdraw a late leave approval.');
    const revoked = await this.grants.revokeForLeave(leaveId, actor.id, this.now());
    if (!revoked) throw AppError.notFound('This leave has no open exception.');
    return revoked;
  }

  private async expiry(now: Date, picked: Date | undefined): Promise<Date> {
    if (!picked) {
      const hours = await readConfigOr(this.config, 'LATE_LEAVE_GRANT_VALID_HOURS', parsePositiveInt(744), 24);
      return new Date(now.getTime() + hours * 3_600_000);
    }
    if (picked <= now) throw AppError.badRequest('The exception must end in the future.', { field: 'expiresAt' });
    const maxHours = await readConfigOr(this.config, 'LATE_LEAVE_GRANT_MAX_HOURS', parsePositiveInt(8760), 168);
    if (picked.getTime() > now.getTime() + maxHours * 3_600_000) throw AppError.badRequest(`The exception can run at most ${maxHours} hours from now.`, { field: 'expiresAt' });
    return picked;
  }
}
