import type { ApprovalsPort, PlanApprovalStatus } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import type { WorkingType } from '../../domain/plan.js';
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
    return { status: planStatus(await this.approvals.getForRecord('DAILY_PLAN', plan.id)), workingType: plan.workingType, dayKind: plan.dayKind, routeIds: [...plan.routeIds], doctorIds: plan.doctors.map((d) => d.doctorId), changedFromMonthly: plan.plannedFrom !== null };
  }

  /** A user's daily plans in a range (both ends inclusive), oldest first, each with its status and working type — a calendar's read. */
  async days(userId: string, from: string, to: string): Promise<Array<{ date: string; status: PlanApprovalStatus; workingType: WorkingType; routeIds: string[] }>> {
    const plans = await this.dailyPlans.listForUser(userId, from, to);
    return Promise.all(plans.map(async (p) => ({ date: p.planDate, status: planStatus(await this.approvals.getForRecord('DAILY_PLAN', p.id)), workingType: p.workingType, routeIds: p.routeIds })));
  }

  async monthly(userId: string, planMonth: string): Promise<PlanApprovalStatus | null> {
    const plan = await this.monthlyPlans.findByUserAndMonth(userId, planMonth);
    return plan && planStatus(await this.approvals.getForRecord('MONTHLY_PLAN', plan.id));
  }

  async isMonthlyPlanApproved(userId: string, planMonth: string): Promise<boolean> {
    const status = await this.monthly(userId, planMonth);
    return status === 'MANAGER_APPROVED' || status === 'APPROVED';
  }

  async isDailyPlanApproved(userId: string, planDate: string): Promise<boolean> {
    const status = await this.daily(userId, planDate);
    return status === 'MANAGER_APPROVED' || status === 'APPROVED';
  }
}
