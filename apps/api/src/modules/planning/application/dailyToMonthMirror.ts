import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { ApprovalStatusChange } from '@/modules/approval/approval.public.js';
import type { DailyPlanRepositoryPort } from '../domain/dailyPlan.repository.port.js';
import type { DailyPlan } from '../domain/dailyPlan.entity.js';
import type { MonthlyPlanRepositoryPort } from '../domain/monthlyPlan.repository.port.js';
import { dayLabel } from '../domain/offDays.js';
import { changedDays } from './approvedMonthEdit.js';
import { assertRoutesMatchTourPlan } from './routeMatch.js';

/**
 * The Tour Plan mirrors the approved Daily Plan (decision-log 2026-11-18): when a day's Daily Plan is approved, or changed after approval,
 * its working type, routes and remarks are written into that day's Tour Plan entry, recorded in the plan's `amendments`. So for a day that
 * was acted on, the two never differ. A trip day (stay or transit, or the day that starts a trip) is left alone: it keeps the trip's type
 * and routes and its Daily Plan can't change them. Returns whether the month changed.
 */
export async function mirrorDayIntoMonth(daily: DailyPlan, actorId: string, monthly: MonthlyPlanRepositoryPort, now: Date, ctx?: TransactionContext): Promise<boolean> {
  const plan = await monthly.findByUserAndMonth(daily.userId, daily.planDate.slice(0, 7));
  const entry = plan?.entries.find((e) => e.planDate === daily.planDate);
  if (!plan || !entry || entry.dayKind !== 'NORMAL' || entry.returnDate) return false;
  const next = { ...entry, workingType: daily.workingType, routeIds: daily.routeIds, remarks: daily.remarks };
  if (changedDays([entry], [next]).length === 0) return false;
  const entries = plan.entries.map((e) => (e.planDate === daily.planDate ? next : e));
  const reason = `Changed on the Daily Plan for ${dayLabel(daily.planDate)}.`;
  return Boolean(await monthly.amend(plan.id, plan.revision, entries, { by: actorId, at: now, reason, previous: plan.entries }, ctx));
}

/** The `DAILY_PLAN` kind's `onStatusChange`: once a day is approved, the Tour Plan takes its working type and routes. */
export function makeDailyPlanMirrorHandler(daily: DailyPlanRepositoryPort, monthly: MonthlyPlanRepositoryPort, deadlines: { now(): Date }) {
  return async (change: ApprovalStatusChange, ctx: TransactionContext): Promise<void> => {
    if (change.status !== 'MANAGER_APPROVED' && change.status !== 'APPROVED') return;
    const plan = await daily.findById(change.recordId);
    // A day whose routes are not its Tour Plan's can't be approved (decision-log 2026-11-19): the Tour Plan is changed first.
    if (plan && change.previousStatus !== 'MANAGER_APPROVED') await assertRoutesMatchTourPlan(monthly, plan.userId, plan.planDate, plan.routeIds, plan.workingType);
    if (plan) await mirrorDayIntoMonth(plan, change.action.actorId, monthly, deadlines.now(), ctx);
  };
}
