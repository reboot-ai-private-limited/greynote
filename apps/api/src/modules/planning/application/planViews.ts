import type { ApprovalRequest } from '@/modules/approval/approval.public.js';
import type { DailyPlan } from '../domain/dailyPlan.entity.js';
import type { MonthlyPlan } from '../domain/monthlyPlan.entity.js';
import type { ApprovalsPort, PlanApprovalStatus } from '../domain/approvals.port.js';
import type { LateSubmitGrantRepositoryPort } from '../domain/lateSubmitGrant.repository.port.js';
import type { PlanKind } from '../domain/plan.js';
import { resubmitWindowEnd, type ResubmitPolicy } from '../domain/resubmitWindow.js';
import type { PlanOffDay } from '../domain/offDays.js';
import { OffDays } from './offDays.js';
import type { PlanDeadlines } from './planDeadlines.js';

/** The request summary a Plan screen shows; the full history is `GET /approvals/:id`. */
export interface PlanApprovalView {
  requestId: string;
  cycle: number;
  submittedAt: Date;
  decidedAt: Date | null;
}

export interface PlanStateView {
  status: PlanApprovalStatus;
  approval: PlanApprovalView | null;
  /** When a submit stops being accepted without a late-submission exception. */
  submitDeadline: Date;
  /** Set while a rejected Plan is inside its after-rejection window: when the window closes. */
  resubmitAllowedUntil: Date | null;
  /** Set while the owner holds a usable late-submission exception for this Plan: when it expires. */
  lateSubmitAllowedUntil: Date | null;
}

/** `changedFromMonthly`: the employee changed the day the Monthly Plan wrote; `plannedFrom` is what it said. */
export type DailyPlanView = DailyPlan & PlanStateView & { changedFromMonthly: boolean };
/** `offDays`: the month's locked days for the owner as they stand now (weekly off, holidays of their main HQ). */
/** `lockedDays`: days nobody can change any more (over, or their Daily Plan has gone to approval): the phone and web show them locked. */
export type MonthlyPlanView = MonthlyPlan & PlanStateView & { offDays: PlanOffDay[]; lockedDays: string[] };

export const planStatus = (request: ApprovalRequest | null): PlanApprovalStatus => request?.status ?? 'DRAFT';

export class PlanViews {
  constructor(
    private readonly approvals: ApprovalsPort,
    private readonly grants: LateSubmitGrantRepositoryPort,
    private readonly deadlines: PlanDeadlines,
    private readonly offDays: OffDays = new OffDays(),
    private readonly locks?: { lockedDays(plan: MonthlyPlan): Promise<{ locked: Map<string, unknown> }> },
  ) {}

  /** `request`: the plan's approval request when the caller already read it (a list reads them in one query), `null` for none. */
  async daily(plan: DailyPlan, request?: ApprovalRequest | null): Promise<DailyPlanView> {
    const [deadline, policy] = await Promise.all([
      this.deadlines.daily(plan.planDate),
      this.deadlines.dailyResubmitPolicy(plan.planDate),
    ]);
    return { ...plan, changedFromMonthly: plan.plannedFrom !== null, ...(await this.state('DAILY_PLAN', plan, plan.planDate, deadline, policy, request)) };
  }

  /** Many Daily Plans at once (2026-11-27): their approval requests in one query instead of one each. */
  async dailyMany(plans: DailyPlan[]): Promise<DailyPlanView[]> {
    if (plans.length === 0) return [];
    const requests = new Map((await this.approvals.listForRecords('DAILY_PLAN', plans.map((p) => p.id))).map((r) => [r.recordId, r]));
    return Promise.all(plans.map((p) => this.daily(p, requests.get(p.id) ?? null)));
  }

  /** See `PlanDeadlines.assertNotAhead`: a Daily Plan is changed or sent on its own business day or later, never ahead. */
  assertNotAhead(planDate: string): Promise<void> {
    return this.deadlines.assertNotAhead(planDate);
  }

  /** A month's Tour Plan window whether or not a plan exists (2026-11-27): its deadline and any late-submission exception. */
  async monthWindow(userId: string, planMonth: string): Promise<{ submitDeadline: Date; lateSubmitAllowedUntil: Date | null }> {
    const [submitDeadline, grant] = await Promise.all([this.deadlines.monthly(planMonth), this.grants.findUsable(userId, 'MONTHLY_PLAN', planMonth, this.deadlines.now())]);
    return { submitDeadline, lateSubmitAllowedUntil: grant?.expiresAt ?? null };
  }

  /**
   * Whether a month's Tour Plan may still be written (2026-11-27): before its deadline, or after it with a late-submission exception
   * (Admin's, or a reopen's) or inside a rejected plan's resubmit window — what a submit would accept.
   */
  async monthOpen(userId: string, planMonth: string, existing: MonthlyPlan | null): Promise<boolean> {
    const deadline = await this.deadlines.monthly(planMonth);
    if (this.deadlines.now() <= deadline) return true;
    if (!existing) return (await this.monthWindow(userId, planMonth)).lateSubmitAllowedUntil !== null;
    const state = await this.state('MONTHLY_PLAN', existing, planMonth, deadline, await this.deadlines.monthlyResubmitPolicy(planMonth));
    return state.resubmitAllowedUntil !== null || state.lateSubmitAllowedUntil !== null;
  }

  async monthly(plan: MonthlyPlan): Promise<MonthlyPlanView> {
    const [deadline, policy, offDays] = await Promise.all([
      this.deadlines.monthly(plan.planMonth),
      this.deadlines.monthlyResubmitPolicy(plan.planMonth),
      this.offDays.forMonth(plan.userId, plan.planMonth),
    ]);
    const lockedDays = this.locks ? [...(await this.locks.lockedDays(plan)).locked.keys()].sort() : [];
    return { ...plan, offDays, lockedDays, ...(await this.state('MONTHLY_PLAN', plan, plan.planMonth, deadline, policy)) };
  }

  private async state(
    kind: PlanKind,
    plan: { id: string; userId: string; lateResubmits: number },
    planKey: string,
    submitDeadline: Date,
    policy: ResubmitPolicy,
    known?: ApprovalRequest | null,
  ): Promise<PlanStateView> {
    const now = this.deadlines.now();
    const [request, grant] = await Promise.all([
      known !== undefined ? Promise.resolve(known) : this.approvals.getForRecord(kind, plan.id),
      this.grants.findUsable(plan.userId, kind, planKey, now),
    ]);
    const windowEnd = resubmitWindowEnd(request, submitDeadline, policy, plan.lateResubmits);
    return {
      status: planStatus(request),
      approval: request && {
        requestId: request.id,
        cycle: request.cycle,
        submittedAt: request.submittedAt,
        decidedAt: request.decidedAt,
      },
      submitDeadline,
      resubmitAllowedUntil: windowEnd && now <= windowEnd ? windowEnd : null,
      lateSubmitAllowedUntil: grant?.expiresAt ?? null,
    };
  }
}
