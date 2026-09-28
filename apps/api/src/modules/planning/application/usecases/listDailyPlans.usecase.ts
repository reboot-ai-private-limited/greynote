import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { DailyPlanView, PlanViews } from '../planViews.js';

/** The caller's own Daily Plans in a date range (both ends inclusive), oldest first. */
export class ListDailyPlansUseCase {
  constructor(
    private readonly plans: DailyPlanRepositoryPort,
    private readonly views: PlanViews,
  ) {}

  async execute(userId: string, from: string, to: string): Promise<DailyPlanView[]> {
    const plans = await this.plans.listForUser(userId, from, to);
    return Promise.all(plans.map((p) => this.views.daily(p)));
  }
}
