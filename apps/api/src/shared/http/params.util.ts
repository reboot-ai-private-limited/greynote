import { AppError } from '@/shared/errors/AppError.js';

/**
 * Express's `req.params` is an index-signature type, so `noUncheckedIndexedAccess` types every
 * access as `string | undefined` even though a matched route guarantees the named param is
 * present. This makes that guarantee explicit instead of asserting past the type checker —
 * throwing only covers the case where a route's `:name` and this call's `name` have drifted
 * apart, which should be impossible.
 */
export function requiredParam(params: Record<string, string | undefined>, name: string): string {
  const value = params[name];
  if (value === undefined) throw AppError.internal('INTERNAL', { reason: 'MISSING_ROUTE_PARAM', name });
  return value;
}
