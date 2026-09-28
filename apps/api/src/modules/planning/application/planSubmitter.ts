import type { ApprovalRequest } from '@/modules/approval/approval.public.js';
import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import type { TransactionContext, TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { LateSubmitGrantRepositoryPort } from '../domain/lateSubmitGrant.repository.port.js';
import type { PlanDay, PlanKind } from '../domain/plan.js';
import { assertPlanDay } from '../domain/planRules.js';
import type { RouteDirectoryPort } from '../domain/routeDirectory.port.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

export interface PlanSubmission {
  kind: PlanKind;
  recordId: string;
  ownerId: string;
  /** The date (`YYYY-MM-DD`) or month (`YYYY-MM`) the Plan is for. */
  planKey: string;
  deadline: Date;
  /** Every day in the Plan, with the field prefix its errors carry. */
  days: Array<{ day: PlanDay; field: string }>;
  /** Inside the transaction: false if the Plan was edited after it was validated here. */
  confirmRevision: (ctx: TransactionContext) => Promise<boolean>;
}

/**
 * The submit pipeline Daily and Monthly Plans share (LLD planning.md, write-path rules): not
 * already pending/approved → not blocked → valid against today's routes and colleagues → before
 * the deadline, or holding a late-submission exception → submitted to the approval module in one
 * transaction with the revision check and the exception's use, so a failed submit keeps it.
 */
export class PlanSubmitter {
  constructor(
    private readonly users: UserDirectoryPort,
    private readonly routes: RouteDirectoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly grants: LateSubmitGrantRepositoryPort,
    private readonly transactions: TransactionRunnerPort,
    private readonly now: () => Date,
  ) {}

  async submit(s: PlanSubmission): Promise<ApprovalRequest> {
    // Before the deadline check, so a Plan that's already waiting doesn't read as "late".
    const existing = await this.approvals.getForRecord(s.kind, s.recordId);
    if (existing && !isEditableBySubmitter(existing.status)) {
      throw AppError.conflict(
        existing.status === 'APPROVED'
          ? 'This plan is already approved. Ask Admin to reopen it.'
          : 'This plan is already waiting for approval.',
      );
    }
    if (await this.users.isBlocked(s.ownerId)) {
      throw AppError.forbidden('You are blocked for missed reports. Admin has to unblock you before you can submit a plan.');
    }
    await this.assertValid(s);

    const now = this.now();
    // Late: only with a late-submission exception, used up by this submit (sign-off B8).
    const grant = now > s.deadline ? await this.grants.findUsable(s.ownerId, s.kind, s.planKey, now) : null;
    if (now > s.deadline && !grant) throw lateError(s);

    return this.transactions.run(async (ctx) => {
      if (grant && !(await this.grants.consume(grant.id, now, ctx))) {
        throw AppError.conflict('The late-submission exception was used, revoked or expired meanwhile.');
      }
      if (!(await s.confirmRevision(ctx))) {
        throw AppError.conflict('This plan changed while it was being submitted. Reload it and try again.');
      }
      return this.approvals.submit({ kind: s.kind, recordId: s.recordId, submitterId: s.ownerId }, ctx);
    });
  }

  private async assertValid(s: PlanSubmission): Promise<void> {
    for (const { day, field } of s.days) assertPlanDay(day, s.ownerId, field);

    const allowed = new Set((await this.routes.listRoutesForUser(s.ownerId)).map((r) => r.id));
    for (const { day, field } of s.days) {
      const notYours = day.routeIds.filter((id) => !allowed.has(id));
      if (notYours.length > 0) {
        throw AppError.badRequest('A route in this plan isn’t one of your active routes.', {
          field: `${field}routeIds`,
          routeIds: notYours,
        });
      }
    }

    const colleagueIds = [...new Set(s.days.flatMap(({ day }) => day.workWith))];
    if (colleagueIds.length === 0) return;
    const active = new Set(
      (await this.users.getUserSummaries(colleagueIds)).filter((u) => u.status === 'active').map((u) => u.id),
    );
    for (const { day, field } of s.days) {
      const unknown = day.workWith.filter((id) => !active.has(id));
      if (unknown.length > 0) {
        throw AppError.badRequest('A colleague in this plan isn’t an active employee.', {
          field: `${field}workWith`,
          userIds: unknown,
        });
      }
    }
  }
}

function lateError(s: PlanSubmission): AppError {
  return new AppError({
    statusCode: 409,
    code: 'PLAN_SUBMIT_LATE',
    message: 'The deadline for this plan has passed. It needs a late-submission exception before it can be submitted.',
    publicDetails: { planKey: s.planKey, deadline: s.deadline.toISOString() },
  });
}
