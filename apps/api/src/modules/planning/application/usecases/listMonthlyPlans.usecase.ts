import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import type { MonthlyPlanView, PlanViews } from '../planViews.js';

/** The caller's own Monthly Plans in a month range (both ends inclusive), oldest first. */
export class ListMonthlyPlansUseCase {
  constructor(
    private readonly plans: MonthlyPlanRepositoryPort,
    private readonly views: PlanViews,
  ) {}

  async execute(userId: string, fromMonth: string, toMonth: string): Promise<MonthlyPlanView[]> {
    const plans = await this.plans.listForUser(userId, fromMonth, toMonth);
    return Promise.all(plans.map((p) => this.views.monthly(p)));
  }
}
