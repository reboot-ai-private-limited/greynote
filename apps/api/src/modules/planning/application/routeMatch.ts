import { AppError } from '@/shared/errors/AppError.js';
import type { MonthlyPlanRepositoryPort } from '../domain/monthlyPlan.repository.port.js';
import { dayLabel } from '../domain/offDays.js';
import { isFieldDay, type WorkingType } from '../domain/plan.js';

const sameRoutes = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * A Daily Plan's routes are its Tour Plan day's routes, always (decision-log 2026-11-19): a different route is a change to the Tour Plan, which goes
 * through the manager above (or Admin). Refuses with `PLAN_ROUTE_MISMATCH` when they differ. A day the Tour Plan has no entry for is not checked.
 */
export async function assertRoutesMatchTourPlan(monthly: MonthlyPlanRepositoryPort, userId: string, planDate: string, routeIds: string[], workingType: WorkingType): Promise<void> {
  // A meeting, conference or strike day has no routes whatever its Tour Plan day said; only a field day carries them.
  if (!isFieldDay(workingType)) return;
  const plan = await monthly.findByUserAndMonth(userId, planDate.slice(0, 7));
  const entry = plan?.entries.find((e) => e.planDate === planDate);
  if (!entry || sameRoutes(entry.routeIds, routeIds)) return;
  throw AppError.conflict(
    `The routes for ${dayLabel(planDate)} are not the ones in the Tour Plan. If the Tour Plan changed after this plan was sent, the employee withdraws it and sends it again (or you reject it); otherwise ask your manager or Admin to change the Tour Plan for that day first; the daily plan then follows it.`,
    { reason: 'PLAN_ROUTE_MISMATCH', planDate },
  );
}
