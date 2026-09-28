import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { PlanDay } from '../../domain/plan.js';
import { assertPlanDay } from '../../domain/planRules.js';
import { assertEditable } from '../assertEditable.js';
import type { DailyPlanView, PlanViews } from '../planViews.js';

/**
 * Create or edit the caller's plan for a day — `DRAFT` until submitted. Route and colleague
 * checks run at submit, against what's true then.
 */
export class SaveDailyPlanUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly views: PlanViews,
  ) {}

  async execute(userId: string, planDate: string, day: PlanDay): Promise<DailyPlanView> {
    assertPlanDay(day, userId);
    const existing = await this.plans.findByUserAndDate(userId, planDate);
    if (existing) await assertEditable(this.approvals, 'DAILY_PLAN', existing.id);
    const saved = await this.plans.save(userId, planDate, day, existing?.revision ?? null);
    if (!saved) throw AppError.conflict('This plan changed while you were saving it. Reload it and try again.');
    return this.views.daily(saved);
  }
}
