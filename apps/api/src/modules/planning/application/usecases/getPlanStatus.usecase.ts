import type { ApprovalsPort, PlanApprovalStatus } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import { planStatus } from '../planViews.js';

/**
 * Behind the public contract: a Plan's status by owner and date, and the DCR gate's one rule —
 * past the manager's stage (sign-off B4). `APPROVED` counts too: a top-of-chain submitter, an
 * Admin override and a manager-only workflow all end there without `MANAGER_APPROVED`.
 */
export class GetPlanStatusUseCase {
  constructor(
    private readonly dailyPlans: DailyPlanRepositoryPort,
    private readonly monthlyPlans: MonthlyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
  ) {}

  async daily(userId: string, planDate: string): Promise<PlanApprovalStatus | null> {
    const plan = await this.dailyPlans.findByUserAndDate(userId, planDate);
    return plan && planStatus(await this.approvals.getForRecord('DAILY_PLAN', plan.id));
  }

  async day(userId: string, planDate: string) {
    const plan = await this.dailyPlans.findByUserAndDate(userId, planDate);
    if (!plan) return null;
    return { status: planStatus(await this.approvals.getForRecord('DAILY_PLAN', plan.id)), workingType: plan.workingType, routeIds: [...plan.routeIds] };
  }

  async monthly(userId: string, planMonth: string): Promise<PlanApprovalStatus | null> {
    const plan = await this.monthlyPlans.findByUserAndMonth(userId, planMonth);
    return plan && planStatus(await this.approvals.getForRecord('MONTHLY_PLAN', plan.id));
  }

  async isDailyPlanApproved(userId: string, planDate: string): Promise<boolean> {
    const status = await this.daily(userId, planDate);
    return status === 'MANAGER_APPROVED' || status === 'APPROVED';
  }
}
