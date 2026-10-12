import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { MonthlyPlanEntry } from '../../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../../domain/monthlyPlan.repository.port.js';
import { assertMonthlyEntries } from '../../domain/planRules.js';
import { carriedInto, expandTrips, shiftMonth } from '../../domain/tripExpansion.js';
import { assertEditable } from '../assertEditable.js';
import type { MonthlyPlanView, PlanViews } from '../planViews.js';

const fingerprint = (entries: MonthlyPlanEntry[]): string =>
  JSON.stringify(
    entries.map((e) => [e.planDate, e.dayKind, e.returnDate, e.workingType, [...e.routeIds].sort(), [...e.workWith].sort(), e.remarks]),
  );

/** Create or replace the caller's plan for a month — every entry at once, `DRAFT` until submitted. */
export class SaveMonthlyPlanUseCase {
  constructor(
    private readonly plans: MonthlyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly views: PlanViews,
  ) {}

  async execute(userId: string, planMonth: string, entries: MonthlyPlanEntry[]): Promise<MonthlyPlanView> {
    // Days the server wrote for a trip come back with the plan; they're rebuilt from the trip, not kept or checked as typed.
    const typed = entries.filter((e) => e.dayKind === 'NORMAL');
    assertMonthlyEntries(planMonth, typed, userId);
    const existing = await this.plans.findByUserAndMonth(userId, planMonth);
    if (existing) await assertEditable(this.approvals, 'MONTHLY_PLAN', existing.id);

    // A trip that set out last month and comes back in this one owns its days here; one that comes back next month puts days there.
    const earlier = await this.plans.findByUserAndMonth(userId, shiftMonth(planMonth, -1));
    const { entries: expanded, spill } = expandTrips(planMonth, typed, carriedInto(planMonth, earlier?.entries ?? []));
    const nextRebuild = await this.planNextMonth(userId, shiftMonth(planMonth, 1), spill);

    const saved = await this.plans.save(userId, planMonth, expanded, existing?.revision ?? null);
    if (!saved) throw AppError.conflict('This plan changed while you were saving it. Reload it and try again.');
    if (nextRebuild) {
      const next = await this.plans.save(userId, nextRebuild.month, nextRebuild.entries, nextRebuild.revision);
      if (!next) throw AppError.conflict('Next month’s plan changed while this one was being saved. Save this plan again.');
    }
    return this.views.monthly(saved);
  }

  /**
   * The next month's plan with the days of a trip that comes back there (`spill`) — made as a draft if the month has no plan yet, and
   * its own trips rebuilt around them. `null` when nothing in it changes. Refused, before anything is saved, when that plan is already
   * waiting or approved, or the employee has planned one of those days.
   */
  private async planNextMonth(userId: string, month: string, spill: MonthlyPlanEntry[]) {
    const plan = await this.plans.findByUserAndMonth(userId, month);
    if (!plan && spill.length === 0) return null;
    const own = (plan?.entries ?? []).filter((e) => e.dayKind === 'NORMAL');
    let rebuilt: MonthlyPlanEntry[];
    try {
      // The month after next isn't touched: what a trip of the next month's own sends further on is rebuilt when that plan is saved.
      rebuilt = expandTrips(month, own, spill).entries;
    } catch (err) {
      if (err instanceof AppError && err.statusCode === 400) {
        throw AppError.badRequest(`The trip runs into ${month}, where one of those days is already planned. Remove it from the ${month} plan first.`, {
          field: 'entries',
        });
      }
      throw err;
    }
    if (plan && fingerprint(plan.entries) === fingerprint(rebuilt)) return null;
    if (plan) await assertEditable(this.approvals, 'MONTHLY_PLAN', plan.id);
    return { month, entries: rebuilt, revision: plan?.revision ?? null };
  }
}
