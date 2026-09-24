import { AppError } from '@/shared/errors/AppError.js';
import type { Route } from '../../domain/route.entity.js';

/** Shared by every revision-checked write: the route moved on while this request was working. */
export function staleRevision(current: Route | null): AppError {
  return AppError.conflict('This route was changed by someone else. Reload it and try again.', {
    field: 'revision',
    currentRevision: current?.revision,
  });
}
