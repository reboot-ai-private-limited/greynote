import { AppError } from '@/shared/errors/AppError.js';
import { CtcBreakdownError } from '../../domain/ctcBreakdown.js';

/** Runs a formula check or a computation and turns a `CtcBreakdownError` into a 400 the caller can show. */
export function asBadRequest<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof CtcBreakdownError) throw AppError.badRequest(error.message);
    throw error;
  }
}
