import type { ApprovalRequest } from '@/modules/approval/approval.public.js';
import type { DailyPlan } from '../domain/dailyPlan.entity.js';
import type { MonthlyPlan } from '../domain/monthlyPlan.entity.js';
import type { ApprovalsPort, PlanApprovalStatus } from '../domain/approvals.port.js';
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
}

export type DailyPlanView = DailyPlan & PlanStateView;
export type MonthlyPlanView = MonthlyPlan & PlanStateView;

export const planStatus = (request: ApprovalRequest | null): PlanApprovalStatus => request?.status ?? 'DRAFT';

export class PlanViews {
  constructor(
    private readonly approvals: ApprovalsPort,
    private readonly deadlines: PlanDeadlines,
  ) {}

  async daily(plan: DailyPlan): Promise<DailyPlanView> {
    return { ...plan, ...(await this.state('DAILY_PLAN', plan.id, await this.deadlines.daily(plan.planDate))) };
  }

  async monthly(plan: MonthlyPlan): Promise<MonthlyPlanView> {
    return { ...plan, ...(await this.state('MONTHLY_PLAN', plan.id, await this.deadlines.monthly(plan.planMonth))) };
  }

  async state(kind: PlanKind, recordId: string, submitDeadline: Date): Promise<PlanStateView> {
    const request = await this.approvals.getForRecord(kind, recordId);
    return {
      status: planStatus(request),
      approval: request && {
        requestId: request.id,
        cycle: request.cycle,
        submittedAt: request.submittedAt,
        decidedAt: request.decidedAt,
      },
      submitDeadline,
    };
  }
}
