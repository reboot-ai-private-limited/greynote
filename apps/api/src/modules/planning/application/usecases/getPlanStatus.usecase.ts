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
    return { status: planStatus(await this.approvals.getForRecord('DAILY_PLAN', plan.id)), workingType: plan.workingType, dayKind: plan.dayKind, routeIds: [...plan.routeIds], fromPlaceId: plan.fromPlaceId ?? null, toPlaceId: plan.toPlaceId ?? null, workWith: [...plan.workWith], doctorIds: plan.doctors.map((d) => d.doctorId), changedFromMonthly: plan.plannedFrom !== null, remarks: plan.remarks };
  }

  /** `days` for many people at once (2026-11-27): their plans in one query and the approvals in one more. */
  async daysForUsers(userIds: string[], from: string, to: string): Promise<Array<{ userId: string; days: Awaited<ReturnType<GetPlanStatusUseCase['days']>> }>> {
    const plans = userIds.length > 0 ? await this.dailyPlans.listForUsers(userIds, from, to) : [];
    const requests = new Map((plans.length > 0 ? await this.approvals.listForRecords('DAILY_PLAN', plans.map((p) => p.id)) : []).map((r) => [r.recordId, r]));
    return userIds.map((userId) => ({
      userId,
      days: plans
        .filter((p) => p.userId === userId)
        .map((p) => ({
          date: p.planDate,
          status: planStatus(requests.get(p.id) ?? null),
          workingType: p.workingType,
          routeIds: p.routeIds,
          workWith: [...p.workWith],
          doctorIds: p.doctors.map((d) => d.doctorId),
          remarks: p.remarks,
          changedFromMonthly: p.plannedFrom !== null,
        })),
    }));
  }

  /** A user's daily plans in a range (both ends inclusive), oldest first, each with its status and working type — a calendar's read. */
  async days(
    userId: string,
    from: string,
    to: string,
  ): Promise<Array<{ date: string; status: PlanApprovalStatus; workingType: WorkingType; routeIds: string[]; workWith: string[]; doctorIds: string[]; remarks: string | null; changedFromMonthly: boolean }>> {
    const plans = await this.dailyPlans.listForUser(userId, from, to);
    // Every plan's approval in one query (2026-11-27), not one each.
    const requests = new Map((plans.length > 0 ? await this.approvals.listForRecords('DAILY_PLAN', plans.map((p) => p.id)) : []).map((r) => [r.recordId, r]));
    return Promise.all(
      plans.map(async (p) => ({
        date: p.planDate,
        status: planStatus(requests.get(p.id) ?? null),
        workingType: p.workingType,
        routeIds: p.routeIds,
        workWith: [...p.workWith],
        doctorIds: p.doctors.map((d) => d.doctorId),
        remarks: p.remarks,
        changedFromMonthly: p.plannedFrom !== null,
      })),
    );
  }

  async monthly(userId: string, planMonth: string): Promise<PlanApprovalStatus | null> {
    const plan = await this.monthlyPlans.findByUserAndMonth(userId, planMonth);
    return plan && planStatus(await this.approvals.getForRecord('MONTHLY_PLAN', plan.id));
  }

  /**
   * Is the month open for daily work? Approved, or approved before and now reopened or waiting again (decision-log 2026-11-19); a rejection or withdrawal closes it: reopening a running month for
   * changes must not stop the MR logging the days that were already approved. A plan never approved stays closed.
   */
  async isMonthlyPlanApproved(userId: string, planMonth: string): Promise<boolean> {
    const plan = await this.monthlyPlans.findByUserAndMonth(userId, planMonth);
    if (!plan) return false;
    const status = planStatus(await this.approvals.getForRecord('MONTHLY_PLAN', plan.id));
    return status === 'MANAGER_APPROVED' || status === 'APPROVED' || (plan.approvedEntries !== undefined && (status === 'REOPENED' || status === 'SUBMITTED'));
  }

  async isDailyPlanApproved(userId: string, planDate: string): Promise<boolean> {
    const status = await this.daily(userId, planDate);
    return status === 'MANAGER_APPROVED' || status === 'APPROVED';
  }
}
