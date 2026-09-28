import type { ApprovalRequest } from '@/modules/approval/approval.public.js';
import type { DailyPlan } from '../domain/dailyPlan.entity.js';
import type { MonthlyPlan } from '../domain/monthlyPlan.entity.js';
import type { ApprovalsPort, PlanApprovalStatus } from '../domain/approvals.port.js';
import type { LateSubmitGrantRepositoryPort } from '../domain/lateSubmitGrant.repository.port.js';
import type { PlanKind } from '../domain/plan.js';
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
  /** Set while the owner holds a usable late-submission exception for this Plan: when it expires. */
  lateSubmitAllowedUntil: Date | null;
}

export type DailyPlanView = DailyPlan & PlanStateView;
export type MonthlyPlanView = MonthlyPlan & PlanStateView;

export const planStatus = (request: ApprovalRequest | null): PlanApprovalStatus => request?.status ?? 'DRAFT';

export class PlanViews {
  constructor(
    private readonly approvals: ApprovalsPort,
    private readonly grants: LateSubmitGrantRepositoryPort,
    private readonly deadlines: PlanDeadlines,
  ) {}

  async daily(plan: DailyPlan): Promise<DailyPlanView> {
    const deadline = await this.deadlines.daily(plan.planDate);
    return { ...plan, ...(await this.state('DAILY_PLAN', plan.userId, plan.id, plan.planDate, deadline)) };
  }

  async monthly(plan: MonthlyPlan): Promise<MonthlyPlanView> {
    const deadline = await this.deadlines.monthly(plan.planMonth);
    return { ...plan, ...(await this.state('MONTHLY_PLAN', plan.userId, plan.id, plan.planMonth, deadline)) };
  }

  private async state(
    kind: PlanKind,
    userId: string,
    recordId: string,
    planKey: string,
    submitDeadline: Date,
  ): Promise<PlanStateView> {
    const [request, grant] = await Promise.all([
      this.approvals.getForRecord(kind, recordId),
      this.grants.findUsable(userId, kind, planKey, this.deadlines.now()),
    ]);
    return {
      status: planStatus(request),
      approval: request && {
        requestId: request.id,
        cycle: request.cycle,
        submittedAt: request.submittedAt,
        decidedAt: request.decidedAt,
      },
      submitDeadline,
      lateSubmitAllowedUntil: grant?.expiresAt ?? null,
    };
  }
}
