import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import { assertMonthlyEntries } from '../../domain/planRules.js';
import { assertEditable } from '../assertEditable.js';
import type { MonthlyPlanView, PlanViews } from '../planViews.js';

/** Create or replace the caller's plan for a month — every entry at once, `DRAFT` until submitted. */
export class SaveMonthlyPlanUseCase {
  constructor(
    private readonly plans: MonthlyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly views: PlanViews,
  ) {}

  async execute(userId: string, planMonth: string, entries: MonthlyPlanEntry[]): Promise<MonthlyPlanView> {
    assertMonthlyEntries(planMonth, entries, userId);
    const existing = await this.plans.findByUserAndMonth(userId, planMonth);
    if (existing) await assertEditable(this.approvals, 'MONTHLY_PLAN', existing.id);
    const sorted = [...entries].sort((a, b) => a.planDate.localeCompare(b.planDate));
    const saved = await this.plans.save(userId, planMonth, sorted, existing?.revision ?? null);
    if (!saved) throw AppError.conflict('This plan changed while you were saving it. Reload it and try again.');
    return this.views.monthly(saved);
  }
}
