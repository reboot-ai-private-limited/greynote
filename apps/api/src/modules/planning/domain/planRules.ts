import { AppError } from '@/shared/errors/AppError.js';
import { isFieldDay, type PlanDay } from './plan.js';

const hasDuplicates = (ids: string[]) => new Set(ids).size !== ids.length;

/**
 * The shape rules every planned day follows, Daily or Monthly entry alike. `field` prefixes the
 * error's field name (`entries.3.` for a Monthly entry).
 */
export function assertPlanDay(day: PlanDay, ownerId: string, field = ''): void {
  if (isFieldDay(day.workingType) && day.routeIds.length === 0) {
    throw AppError.badRequest('A field work or doctor campaign day needs at least one route.', { field: `${field}routeIds` });
  }
  if (!isFieldDay(day.workingType) && day.routeIds.length > 0) {
    throw AppError.badRequest('Only a field work or doctor campaign day has routes.', { field: `${field}routeIds` });
  }
  if (hasDuplicates(day.routeIds)) {
    throw AppError.badRequest('A route is listed twice.', { field: `${field}routeIds` });
  }
  if (hasDuplicates(day.workWith)) {
    throw AppError.badRequest('A colleague is listed twice.', { field: `${field}workWith` });
  }
  if (day.workWith.includes(ownerId)) {
    throw AppError.badRequest('You can’t work with yourself.', { field: `${field}workWith` });
  }
}

/** Every entry inside `planMonth`, no day twice, and each a valid planned day. */
export function assertMonthlyEntries(planMonth: string, entries: Array<PlanDay & { planDate: string }>, ownerId: string): void {
  const seen = new Set<string>();
  entries.forEach((entry, i) => {
    const field = `entries.${i}.`;
    if (!entry.planDate.startsWith(`${planMonth}-`)) {
      throw AppError.badRequest('A day in this plan is outside its month.', { field: `${field}planDate` });
    }
    if (seen.has(entry.planDate)) {
      throw AppError.badRequest('A day is planned twice.', { field: `${field}planDate` });
    }
    seen.add(entry.planDate);
    assertPlanDay(entry, ownerId, field);
  });
}
