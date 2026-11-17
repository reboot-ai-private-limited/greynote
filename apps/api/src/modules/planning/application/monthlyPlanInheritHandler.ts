import { isEditableBySubmitter, type ApprovalStatusChange } from '@/modules/approval/approval.public.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import type { MonthlyPlan, MonthlyPlanEntry } from '../domain/monthlyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../domain/monthlyPlan.repository.port.js';
import { sameDay, type PlanDay } from '../domain/plan.js';
import { dayLabel } from '../domain/offDays.js';
import { changedDays } from './approvedMonthEdit.js';
import type { PlanDayLocks } from './dayLocks.js';
import { OffDays } from './offDays.js';
import type { PlanDeadlines } from './planDeadlines.js';

/**
 * The `MONTHLY_PLAN` kind's `onStatusChange`, run inside the approval module's transaction: once the month is past the manager
 * (`MANAGER_APPROVED`, or `APPROVED` straight away for a manager-only workflow or an Admin override), every entry from today
 * on becomes that day's Daily Plan, `source: MONTHLY`, as a draft. Inheriting never approves anything — the employee still
 * submits each day and the manager still approves it — and the employee can't edit it, only a manager or Admin can amend.
 *
 * Safe to run again (`MANAGER_APPROVED` then `APPROVED`, or a reopened and re-approved month):
 * - no plan for the day yet: created;
 * - an inherited plan that hasn't been submitted (or came back for changes): brought in line with the entry;
 * - a day that was submitted, approved, written by the employee, or amended by a manager: left alone.
 * Past days are skipped: nothing can be logged against them any more. So are `offDates` (weekly off, a holiday of the employee's
 * main HQ, as they stand now): a holiday added after the month was approved gets no new Daily Plan, while one already written is
 * left as it is (decision-log 2026-10-22).
 */
export async function inheritDays(
  plan: MonthlyPlan,
  daily: DailyPlanRepositoryPort,
  approvals: ApprovalsPort,
  today: string,
  ctx: TransactionContext,
  offDates: ReadonlySet<string> = new Set(),
): Promise<number> {
  let written = 0;
  for (const { planDate, ...entry } of plan.entries) {
    if (planDate < today || offDates.has(planDate)) continue;
    if (await daily.createInherited(plan.userId, planDate, { ...entry, workWith: [] }, ctx)) {
      written++;
      continue;
    }
    const existing = await daily.findByUserAndDate(plan.userId, planDate);
    if (!existing || existing.source !== 'MONTHLY' || existing.amendments.length > 0 || sameDay(existing, entry)) continue;
    const request = await approvals.getForRecord('DAILY_PLAN', existing.id);
    if (request && !isEditableBySubmitter(request.status)) continue;
    if (await daily.applyChange(existing.id, existing.revision, entry, ctx)) written++;
  }
  return written;
}

/**
 * Puts back the days that were locked by the time the month is approved but typed differently (decision-log 2026-11-18): a resubmission
 * approved three days late must not rewrite those three days. The reference is the Daily Plan the day already has, else the day as last
 * approved (`approvedEntries`). A day added to the past after the last approval is removed; a worked day that was deleted comes back.
 * Returns the plan (changed in place, with an `amendments` row) and the days put back. The first approval of a month has no reference.
 */
export async function restoreLocked(
  plan: MonthlyPlan,
  actorId: string,
  locks: PlanDayLocks,
  monthly: MonthlyPlanRepositoryPort,
  now: Date,
  today: string,
  ctx: TransactionContext,
): Promise<{ plan: MonthlyPlan; restored: string[] }> {
  const { locked, dailies } = await locks.lockedDays(plan);
  const approved = plan.approvedEntries;
  if (!approved && dailies.size === 0) return { plan, restored: [] };
  const was = new Map((approved ?? []).map((e) => [e.planDate, e]));
  // The Daily Plan the day already has is the truth (its working type and routes); else the day as last approved.
  const referenceOf = (e: MonthlyPlanEntry): MonthlyPlanEntry | null => {
    const earlier = was.get(e.planDate);
    const daily = dailies.get(e.planDate);
    if (daily) return { ...(earlier ?? e), workingType: daily.workingType, dayKind: daily.dayKind, routeIds: daily.routeIds, remarks: daily.remarks };
    return earlier ?? null;
  };
  const restored = new Set<string>();
  const entries: MonthlyPlanEntry[] = [];
  for (const e of plan.entries) {
    if (!locked.has(e.planDate)) {
      entries.push(e);
      continue;
    }
    const reference = referenceOf(e);
    if (reference) {
      if (changedDays([e], [reference]).length > 0) restored.add(e.planDate);
      entries.push(reference);
    } else if (approved) {
      restored.add(e.planDate); // typed into the past after the last approval: it was never planned
    } else {
      entries.push(e);
    }
  }
  const present = new Set(plan.entries.map((e) => e.planDate));
  for (const e of approved ?? []) {
    if (e.planDate <= today && !present.has(e.planDate)) {
      entries.push(e);
      restored.add(e.planDate);
    }
  }
  if (restored.size === 0) return { plan, restored: [] };
  entries.sort((a, b) => a.planDate.localeCompare(b.planDate));
  const days = [...restored].sort();
  const reason = `Kept as already worked: ${days.map(dayLabel).join(', ')}.`;
  const amended = await monthly.amend(plan.id, plan.revision, entries, { by: actorId, at: now, reason, previous: plan.entries }, ctx);
  return { plan: amended ?? plan, restored: days };
}

export function makeMonthlyPlanInheritHandler(
  monthly: MonthlyPlanRepositoryPort,
  daily: DailyPlanRepositoryPort,
  approvals: ApprovalsPort,
  deadlines: PlanDeadlines,
  offDays: OffDays = new OffDays(),
  locks?: PlanDayLocks,
) {
  return async (change: ApprovalStatusChange, ctx: TransactionContext): Promise<void> => {
    if (change.status !== 'MANAGER_APPROVED' && change.status !== 'APPROVED') return;
    let plan = await monthly.findById(change.recordId);
    if (!plan) throw AppError.internal('INTERNAL', { reason: 'MONTHLY_PLAN_NOT_FOUND', recordId: change.recordId });
    const today = await deadlines.today();
    if (locks) {
      plan = (await restoreLocked(plan, change.action.actorId, locks, monthly, deadlines.now(), today, ctx)).plan;
      await monthly.recordApproved(plan.id, plan.entries, ctx);
    }
    await inheritDays(plan, daily, approvals, today, ctx, await offDatesOf(offDays, plan));
  };
}

/** The off days among the dates an approved plan's entries fall on (its own month: a trip's days next month are that plan's entries). */
export async function offDatesOf(offDays: OffDays, plan: MonthlyPlan): Promise<Set<string>> {
  const last = plan.entries.reduce((max, e) => (e.planDate > max ? e.planDate : max), `${plan.planMonth}-01`);
  return new Set((await offDays.list(plan.userId, `${plan.planMonth}-01`, last)).map((d) => d.date));
}

