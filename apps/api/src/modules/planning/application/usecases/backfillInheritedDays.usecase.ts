import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../../domain/dailyPlan.repository.port.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import { inheritDays } from '../monthlyPlanInheritHandler.js';
import type { PlanDeadlines } from '../planDeadlines.js';

/**
 * One-off (decision-log 2026-10-03): Monthly Plans approved before Daily Plans were inherited get their coming days written
 * now, as approving them today would. With `apply` false it only counts the plans it would visit. Safe to repeat.
 */
export class BackfillInheritedDaysUseCase {
  constructor(
    private readonly monthly: MonthlyPlanRepositoryPort,
    private readonly daily: DailyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly deadlines: PlanDeadlines,
    private readonly transactions: TransactionRunnerPort,
  ) {}

  async execute(apply: boolean): Promise<{ approvedMonthlyPlans: number; dailyPlansWritten: number }> {
    const today = await this.deadlines.today();
    let approvedMonthlyPlans = 0;
    let dailyPlansWritten = 0;
    for (const plan of await this.monthly.listFromMonth(today.slice(0, 7))) {
      const status = (await this.approvals.getForRecord('MONTHLY_PLAN', plan.id))?.status;
      if (status !== 'MANAGER_APPROVED' && status !== 'APPROVED') continue;
      approvedMonthlyPlans++;
      if (apply) dailyPlansWritten += await this.transactions.run((ctx) => inheritDays(plan, this.daily, this.approvals, today, ctx));
    }
    return { approvedMonthlyPlans, dailyPlansWritten };
  }
}
