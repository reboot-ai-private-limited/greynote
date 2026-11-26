import { AppError } from '@/shared/errors/AppError.js';
import { isFieldDay, type PlanDay } from './plan.js';

const hasDuplicates = (ids: string[]) => new Set(ids).size !== ids.length;

/**
 * The shape rules every planned day follows, Daily or Monthly entry alike. `field` prefixes the
 * error's field name (`entries.3.` for a Monthly entry).
 */
export function assertPlanDay(day: PlanDay, ownerId: string, field = ''): void {
  const places = Boolean(day.fromPlaceId || day.toPlaceId);
  if (places && (!day.fromPlaceId || !day.toPlaceId)) {
    throw AppError.badRequest('Choose where the day starts and where it ends.', { field: `${field}${day.fromPlaceId ? 'toPlaceId' : 'fromPlaceId'}` });
  }
  // A field day goes From → To (2026-11-26); one from before then (or an older phone) names its routes instead.
  if (isFieldDay(day.workingType) && !places && day.routeIds.length === 0) {
    throw AppError.badRequest('A field work or doctor campaign day needs a From and a To.', { field: `${field}toPlaceId` });
  }
  if (!isFieldDay(day.workingType) && (day.routeIds.length > 0 || places)) {
    throw AppError.badRequest('Only a field work or doctor campaign day has places and routes.', { field: `${field}${places ? 'toPlaceId' : 'routeIds'}` });
  }
  if (places && day.routeIds.length > 1) {
    throw AppError.badRequest('A day goes along one route.', { field: `${field}routeIds` });
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
