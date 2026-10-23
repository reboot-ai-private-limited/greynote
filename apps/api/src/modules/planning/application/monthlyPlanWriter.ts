import { AppError } from '@/shared/errors/AppError.js';
import { monthRange } from '@/shared/time/businessTime.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { MonthlyPlan, MonthlyPlanEntry } from '../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../domain/monthlyPlan.repository.port.js';
import { assertNoOffDays, lastDayOf } from '../domain/offDays.js';
import { assertMonthlyEntries } from '../domain/planRules.js';
import { carriedInto, expandTrips, shiftMonth } from '../domain/tripExpansion.js';
import { assertEditable } from './assertEditable.js';
import type { OffDays } from './offDays.js';

const fingerprint = (entries: MonthlyPlanEntry[]): string =>
  JSON.stringify(
    entries.map((e) => [e.planDate, e.dayKind, e.returnDate, e.workingType, [...e.routeIds].sort(), [...e.workWith].sort(), e.remarks]),
  );

/** A month's entries ready to store, and the next month's plan when the trips of this one change it. */
export interface PreparedMonth {
  entries: MonthlyPlanEntry[];
  next: { month: string; entries: MonthlyPlanEntry[]; revision: number | null } | null;
}

/**
 * What writing a Monthly Plan takes, whoever writes it — the employee saving, or a manager amending: the typed days are checked,
 * none may fall on an off day, a trip is expanded into its stay and transit days (also into next month), and next month's plan is
 * rebuilt around the days that spill into it.
 */
export class MonthlyPlanWriter {
  constructor(
    private readonly plans: MonthlyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly offDays: OffDays,
  ) {}

  /** `beforeExpand` runs once the days are known to be well-formed — the caller's own check on the plan's state goes there. */
  async prepare(userId: string, planMonth: string, entries: MonthlyPlanEntry[], beforeExpand: () => Promise<void>): Promise<PreparedMonth> {
    // Days the server wrote for a trip come back with the plan; they're rebuilt from the trip, not kept or checked as typed.
    const typed = entries.filter((e) => e.dayKind === 'NORMAL');
    assertMonthlyEntries(planMonth, typed, userId);
    const lastDay = lastDayOf(typed, monthRange(planMonth).to);
    assertNoOffDays(entries, await this.offDays.byDate(userId, monthRange(planMonth).from, lastDay));
    await beforeExpand();

    // A trip that set out last month and comes back in this one owns its days here; one that comes back next month puts days there.
    const earlier = await this.plans.findByUserAndMonth(userId, shiftMonth(planMonth, -1));
    const { entries: expanded, spill } = expandTrips(planMonth, typed, carriedInto(planMonth, earlier?.entries ?? []));
    return { entries: expanded, next: await this.planNextMonth(userId, shiftMonth(planMonth, 1), spill) };
  }

  /** Stores the next month's rebuilt plan, if there is one. */
  async saveNext(userId: string, prepared: PreparedMonth): Promise<void> {
    const { next } = prepared;
    if (!next) return;
    const saved = await this.plans.save(userId, next.month, next.entries, next.revision);
    if (!saved) throw AppError.conflict('Next month’s plan changed while this one was being saved. Save this plan again.');
  }

  /**
   * The next month's plan with the days of a trip that comes back there (`spill`) — made as a draft if the month has no plan yet, and
   * its own trips rebuilt around them. `null` when nothing in it changes. Refused, before anything is saved, when that plan is already
   * waiting or approved, or the employee has planned one of those days.
   */
  private async planNextMonth(userId: string, month: string, spill: MonthlyPlanEntry[]): Promise<PreparedMonth['next']> {
    const plan: MonthlyPlan | null = await this.plans.findByUserAndMonth(userId, month);
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
