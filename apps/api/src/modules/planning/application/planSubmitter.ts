import type { ApprovalRequest } from '@/modules/approval/approval.public.js';
import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import type { TransactionContext, TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { LateSubmitGrant } from '../domain/lateSubmitGrant.entity.js';
import type { LateSubmitGrantRepositoryPort } from '../domain/lateSubmitGrant.repository.port.js';
import type { PlanDay, PlanKind } from '../domain/plan.js';
import { assertPlanDay } from '../domain/planRules.js';
import { resubmitWindowEnd, type ResubmitPolicy } from '../domain/resubmitWindow.js';
import type { RouteDirectoryPort } from '../domain/routeDirectory.port.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

export interface PlanSubmission {
  kind: PlanKind;
  recordId: string;
  ownerId: string;
  /** The date (`YYYY-MM-DD`) or month (`YYYY-MM`) the Plan is for. */
  planKey: string;
  deadline: Date;
  /** The after-rejection window, and how many resubmits this Plan already made through it. */
  resubmitPolicy: ResubmitPolicy;
  lateResubmits: number;
  /** Every day in the Plan, with the field prefix its errors carry. */
  days: Array<{ day: PlanDay; field: string }>;
  /** A manager's Daily Plan may also use the routes of the team members it works with. */
  alsoRoutesOf?: string[];
  /**
   * Inside the transaction: false if the Plan was edited after it was validated here.
   * `countLateResubmit` records a submit through the resubmit window.
   */
  confirmRevision: (countLateResubmit: boolean, ctx: TransactionContext) => Promise<boolean>;
}

/**
 * The submit pipeline Daily and Monthly Plans share (LLD planning.md, write-path rules): not
 * already pending/approved → not blocked → valid against today's routes and colleagues → before
 * the deadline, inside the after-rejection window, or holding a late-submission exception →
 * submitted to the approval module in one transaction with the revision check and the window
 * count or the exception's use, so a failed submit keeps both.
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
      throw AppError.forbidden('You are blocked for missed reports. Your manager or Admin has to unblock you before you can submit a plan.');
    }
    await this.validateDays(s.ownerId, s.days, s.alsoRoutesOf);

    // Late (sign-off B8): the after-rejection window first, so an exception is kept for later;
    // otherwise a late-submission exception, used up by this submit.
    const now = this.now();
    let inWindow = false;
    let grant: LateSubmitGrant | null = null;
    if (now > s.deadline) {
      const windowEnd = resubmitWindowEnd(existing, s.deadline, s.resubmitPolicy, s.lateResubmits);
      inWindow = windowEnd !== null && now <= windowEnd;
      if (!inWindow) grant = await this.grants.findUsable(s.ownerId, s.kind, s.planKey, now);
      if (!inWindow && !grant) throw lateError(s);
    }

    return this.transactions.run(async (ctx) => {
      if (grant && !(await this.grants.consume(grant.id, now, ctx))) {
        throw AppError.conflict('The late-submission exception was used, revoked or expired meanwhile.');
      }
      if (!(await s.confirmRevision(inWindow, ctx))) {
        throw AppError.conflict('This plan changed while it was being submitted. Reload it and try again.');
      }
      return this.approvals.submit({ kind: s.kind, recordId: s.recordId, submitterId: s.ownerId }, ctx);
    });
  }

  /** Every day is well-formed, on the owner's own active routes, with active colleagues — checked against today's state. */
  async validateDays(ownerId: string, days: Array<{ day: PlanDay; field: string }>, alsoRoutesOf: string[] = []): Promise<void> {
    const s = { ownerId, days };
    for (const { day, field } of s.days) assertPlanDay(day, s.ownerId, field);

    const mine = (await Promise.all([s.ownerId, ...alsoRoutesOf].map((id) => this.routes.listRoutesForUser(id)))).flat();
    const allowed = new Set(mine.map((r) => r.id));
    const outStation = new Set(mine.filter((r) => r.routeType === 'OUT_STATION').map((r) => r.id));
    for (const { day, field } of s.days) {
      // A stay or transit day is part of an out-station trip, so its routes have to include an out-station one.
      if (day.dayKind !== 'NORMAL' && !day.routeIds.some((id) => outStation.has(id))) {
        throw AppError.badRequest('A trip with a return date needs an out-station route. For other routes, plan each day on its own.', {
          field: `${field}routeIds`,
        });
      }
      const notYours = day.routeIds.filter((id) => !allowed.has(id));
      if (notYours.length > 0) {
        throw AppError.badRequest(alsoRoutesOf.length > 0 ? 'A route in this plan isn’t one of your active routes or those of the team you work with.' : 'A route in this plan isn’t one of your active routes.', {
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
