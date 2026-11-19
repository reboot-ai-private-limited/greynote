import { isEditableBySubmitter } from '@/modules/approval/approval.public.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { DailyPlan } from '../domain/dailyPlan.entity.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import type { MonthlyPlan, MonthlyPlanEntry } from '../domain/monthlyPlan.entity.js';
import { dayLabel } from '../domain/offDays.js';
import { changedDays } from './approvedMonthEdit.js';

/** Why a day can no longer change: it is over, or its Daily Plan has already gone to approval. */
export type LockReason = 'PAST' | 'SENT';

/**
 * Which days of a Tour Plan are locked (decision-log 2026-11-18). A day is locked once the month has been approved before AND the day is
 * today or earlier, or its Daily Plan is waiting or approved. Nobody changes a locked day, by any route: the employee's save, a manager's
 * edit of a waiting plan, Admin or HR. A trip falls out of the same rule, because its stay and transit days are ordinary entries: a trip
 * can't be made to end before a locked day, and a locked day can't be turned into a trip day.
 * A plan that was never approved can still plan today and later, but a day that is over is locked all the same; a Daily Plan that was sent locks its day.
 */
export class PlanDayLocks {
  constructor(
    private readonly daily: DailyPlanRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly deadlines: { today(): Promise<string> },
  ) {}

  /** The locked days among the plan's stored entries, with the Daily Plan each has. */
  async lockedDays(plan: MonthlyPlan, alsoDates: string[] = []): Promise<{ locked: Map<string, LockReason>; dailies: Map<string, DailyPlan> }> {
    const locked = new Map<string, LockReason>();
    const dailies = new Map<string, DailyPlan>();
    if (plan.entries.length === 0 && alsoDates.length === 0) return { locked, dailies };
    const dates = [...new Set([...plan.entries.map((e) => e.planDate), ...alsoDates])].sort();
    for (const d of await this.daily.listForUser(plan.userId, dates[0]!, dates[dates.length - 1]!)) dailies.set(d.planDate, d);
    const everApproved = Boolean(plan.approvedEntries) || dailies.size > 0;
    const today = await this.deadlines.today();
    for (const date of dates) {
      const daily = dailies.get(date);
      if (daily) {
        const request = await this.approvals.getForRecord('DAILY_PLAN', daily.id);
        // Today's own Daily Plan only locks the day once it is approved: while it is still waiting it can be changed (the approver then sees a mismatch and
        // the employee withdraws it), decision-log 2026-11-19. Any later day is locked as soon as it is sent.
        const approved = request?.status === 'APPROVED' || request?.status === 'MANAGER_APPROVED';
        if (request && !isEditableBySubmitter(request.status) && (date !== today || approved)) locked.set(date, 'SENT');
      }
      // Once approved, today stays open until its Daily Plan is approved; a day that is over never changes.
      if (date < today && !locked.has(date)) locked.set(date, 'PAST');
    }
    return { locked, dailies };
  }

  /** Throws a 409 naming the first locked day that `after` would change. Does nothing for a plan that doesn't exist yet. */
  async assertUnchanged(plan: MonthlyPlan | null, after: MonthlyPlanEntry[]): Promise<void> {
    if (!plan) return;
    const { locked } = await this.lockedDays(plan, after.map((e) => e.planDate));
    if (locked.size === 0) return;
    const today = await this.deadlines.today();
    const hit = changedDays(plan.entries, after).find((c) => locked.has(c.date));
    if (hit) {
      throw AppError.conflict(
        locked.get(hit.date) === 'SENT'
          ? hit.date === today
            ? `Today’s daily plan is already approved, so today can’t change. Change the days after today.`
            : `The daily plan for ${dayLabel(hit.date)} has already been sent for approval, so that day can’t be changed.`
          : `${dayLabel(hit.date)} is ${hit.date === today ? 'today' : 'in the past'}, so it can’t be changed.`,
        { reason: 'PLAN_DAY_LOCKED', planDate: hit.date },
      );
    }
    // A trip can't be started from a locked day that wasn't one already.
    const was = new Map(plan.entries.map((e) => [e.planDate, e]));
    for (const e of after) {
      if (locked.has(e.planDate) && e.returnDate && !was.get(e.planDate)?.returnDate) {
        throw AppError.conflict(`${dayLabel(e.planDate)} can’t start a trip now.`, { reason: 'PLAN_DAY_LOCKED', planDate: e.planDate });
      }
    }
  }
}
