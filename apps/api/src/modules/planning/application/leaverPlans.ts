import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import type { MonthlyPlanRepositoryPort } from '../domain/monthlyPlan.repository.port.js';
import { shiftMonth } from '../domain/tripExpansion.js';
import { addDays } from '@/shared/time/businessTime.js';

const OPEN = new Set(['SUBMITTED', 'MANAGER_APPROVED']);
/** How far ahead a leaver's plans are looked for: next month's Monthly Plan and its days are the furthest anyone plans. */
const AHEAD_DAYS = 62;

/**
 * A leaving employee's Plans dated after their last working day that still wait for a decision (decision-log 2026-10-22): their
 * Daily Plans after that day, and their Monthly Plans of later months. Closing rejects each with the reason, so no manager keeps
 * them in the inbox. The leaving month's Monthly Plan stays: it covers days they worked. Drafts and decided plans are left alone.
 */
export class LeaverPlans {
  constructor(
    private readonly daily: DailyPlanRepositoryPort,
    private readonly monthly: MonthlyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
  ) {}

  private async open(userId: string, lastWorkingDay: string): Promise<Array<{ kind: 'DAILY_PLAN' | 'MONTHLY_PLAN'; id: string }>> {
    const firstMonth = shiftMonth(lastWorkingDay.slice(0, 7), 1);
    const [days, months] = await Promise.all([
      this.daily.listForUser(userId, addDays(lastWorkingDay, 1), addDays(lastWorkingDay, AHEAD_DAYS)),
      this.monthly.listForUser(userId, firstMonth, shiftMonth(firstMonth, 1)),
    ]);
    const plans = [...days.map((p) => ({ kind: 'DAILY_PLAN' as const, id: p.id })), ...months.map((p) => ({ kind: 'MONTHLY_PLAN' as const, id: p.id }))];
    const waiting: Array<{ kind: 'DAILY_PLAN' | 'MONTHLY_PLAN'; id: string }> = [];
    for (const plan of plans) {
      const request = await this.approvals.getForRecord(plan.kind, plan.id);
      if (request && OPEN.has(request.status)) waiting.push(plan);
    }
    return waiting;
  }

  async count(userId: string, lastWorkingDay: string): Promise<number> {
    return (await this.open(userId, lastWorkingDay)).length;
  }

  async close(userId: string, lastWorkingDay: string): Promise<number> {
    let closed = 0;
    for (const plan of await this.open(userId, lastWorkingDay)) {
      if (await this.approvals.autoReject(plan.kind, plan.id, `The employee left on ${lastWorkingDay}.`)) closed++;
    }
    return closed;
  }
}
