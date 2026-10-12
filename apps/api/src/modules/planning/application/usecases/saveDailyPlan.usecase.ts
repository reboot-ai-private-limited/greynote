import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { PlanDay } from '../../domain/plan.js';
import { assertPlanDay } from '../../domain/planRules.js';
import { assertEditable } from '../assertEditable.js';
import { assertMonthlyApproved, type MonthlyApprovedCheck } from '../monthlyGate.js';
import type { DailyPlanView, PlanViews } from '../planViews.js';

/**
 * Create or edit the caller's plan for a day — only in a month whose Monthly Plan is approved — `DRAFT` until submitted. A day inherited from the approved Monthly Plan is read-only
 * to its owner (`PLAN_INHERITED_READONLY`): they submit it as it is. Route and colleague
 * checks run at submit, against what's true then.
 */
export class SaveDailyPlanUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly views: PlanViews,
    private readonly monthlyApproved: MonthlyApprovedCheck,
  ) {}

  async execute(userId: string, planDate: string, day: PlanDay): Promise<DailyPlanView> {
    assertPlanDay(day, userId);
    await assertMonthlyApproved(this.monthlyApproved, userId, planDate);
    const existing = await this.plans.findByUserAndDate(userId, planDate);
    if (existing?.source === 'MONTHLY') {
      throw AppError.conflict('This day comes from your approved monthly plan and can’t be changed here. Submit it as it is, or ask your manager to amend it.', {
        reason: 'PLAN_INHERITED_READONLY',
      });
    }
    if (existing) await assertEditable(this.approvals, 'DAILY_PLAN', existing.id);
    const saved = await this.plans.save(userId, planDate, day, existing?.revision ?? null);
    if (!saved) throw AppError.conflict('This plan changed while you were saving it. Reload it and try again.');
    return this.views.daily(saved);
  }
}
