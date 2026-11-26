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
import type { ManagerScope } from './managerScope.js';

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
  /** A manager's plan may also name the routes held by these people: everyone below them (`ManagerScope.routePeople`). */
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
    /** Whose routes a manager's plan may also name; without it every plan is checked against the owner's own routes only. */
    private readonly scope?: ManagerScope,
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
    // A reopened plan has no special pass: the reopen made a late-submission exception that lasts the time they chose (decision-log 2026-11-19).
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

  /** Every day is well-formed, on the owner's own active routes (a manager's: or those of anyone below them), with colleagues from their own reporting line — checked against today's state. */
  async validateDays(ownerId: string, days: Array<{ day: PlanDay; field: string }>, alsoRoutesOfGiven?: string[]): Promise<void> {
    const s = { ownerId, days };
    // A manager's plan, monthly or daily, may name the routes of anyone below them; an MR's only their own (decision-log 2026-11-17).
    const alsoRoutesOf = alsoRoutesOfGiven ?? (this.scope ? await this.scope.routePeople(ownerId) : []);
    for (const { day, field } of s.days) assertPlanDay(day, s.ownerId, field);

    const mine = await this.routes.listRoutesForUsers([s.ownerId, ...alsoRoutesOf]);
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
        throw AppError.badRequest(alsoRoutesOf.length > 0 ? 'A route in this plan isn’t held by you or by anyone below you.' : 'A route in this plan isn’t one of your active routes.', {
          field: `${field}routeIds`,
          routeIds: notYours,
        });
      }
    }

    // From and To (2026-11-26): places of the owner's HQ, or for a manager also of the HQs of anyone below them.
    const placed = s.days.filter(({ day }) => day.fromPlaceId || day.toPlaceId);
    if (placed.length > 0) {
      const plannable = new Set((await this.routes.listPlacesForUsers([s.ownerId, ...alsoRoutesOf])).map((p) => p.id));
      for (const { day, field } of placed) {
        for (const [key, id] of [['fromPlaceId', day.fromPlaceId], ['toPlaceId', day.toPlaceId]] as const) {
          if (id && !plannable.has(id)) {
            throw AppError.badRequest(alsoRoutesOf.length > 0 ? 'A place in this plan isn’t in your HQ or the HQ of anyone below you.' : 'A place in this plan isn’t in your HQ.', {
              field: `${field}${key}`,
            });
          }
        }
      }
    }

    const colleagueIds = [...new Set(s.days.flatMap(({ day }) => day.workWith))];
    if (colleagueIds.length === 0) return;
    // Work With is the owner's own reporting tree: the managers above them and everyone below, active only.
    const [upline, downline] = await Promise.all([this.users.getManagerChain(s.ownerId), this.users.getDownline(s.ownerId)]);
    const inTree = new Set([...upline, ...downline].filter((u) => u.status === 'active').map((u) => u.id));
    for (const { day, field } of s.days) {
      const unknown = day.workWith.filter((id) => !inTree.has(id));
      if (unknown.length > 0) {
        throw AppError.badRequest('You can only work with active people in your own reporting line.', {
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
