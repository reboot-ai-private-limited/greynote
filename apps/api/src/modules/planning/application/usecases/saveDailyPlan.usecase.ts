import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { PlanDay } from '../../domain/plan.js';
import { assertPlanDay } from '../../domain/planRules.js';
import type { DailyPlanView, PlanViews } from '../planViews.js';

/**
 * Create or edit the caller's plan for a day — `DRAFT` until submitted. Editable again after a
 * rejection, withdrawal or Admin reopen; frozen while waiting or approved (client §2.5). Route
 * and colleague checks run at submit, against what's true then.
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
    if (existing) {
      const request = await this.approvals.getForRecord('DAILY_PLAN', existing.id);
      if (request && !isEditableBySubmitter(request.status)) {
        throw AppError.conflict(
          request.status === 'APPROVED'
            ? 'This plan is approved and can’t be edited. Ask Admin to reopen it.'
            : request.status === 'SUBMITTED'
            ? 'This plan is waiting for approval and can’t be edited. Withdraw it first.'
            : 'This plan is waiting for approval and can’t be edited.',
        );
      }
    }
    const saved = await this.plans.save(userId, planDate, day, existing?.revision ?? null);
    if (!saved) throw AppError.conflict('This plan changed while you were saving it. Reload it and try again.');
    return this.views.daily(saved);
  }
}
