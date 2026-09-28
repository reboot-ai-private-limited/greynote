import { AppError } from '@/shared/errors/AppError.js';
import type { PlanDay } from './plan.js';

const hasDuplicates = (ids: string[]) => new Set(ids).size !== ids.length;

/**
 * The shape rules every planned day follows, Daily or Monthly entry alike. `field` prefixes the
 * error's field name (`entries.3.` for a Monthly entry).
 */
export function assertPlanDay(day: PlanDay, ownerId: string, field = ''): void {
  if (day.workingType === 'FIELD_WORK' && day.routeIds.length === 0) {
    throw AppError.badRequest('A field work day needs at least one route.', { field: `${field}routeIds` });
  }
  if (day.workingType !== 'FIELD_WORK' && day.routeIds.length > 0) {
    throw AppError.badRequest('Only a field work day has routes.', { field: `${field}routeIds` });
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
