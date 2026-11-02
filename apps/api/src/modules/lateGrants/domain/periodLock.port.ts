import type { LateGrantKind } from './lateGrant.entity.js';

/**
 * Money or records downstream of a period that make a late entry unsafe (payroll finalized, expenses paid, …). Each module that
 * owns such state contributes one guard at wiring time; a guard returns why the period is locked, or `null` when it is safe.
 */
export interface PeriodLockGuard {
  /** Which kinds this guard has an opinion on. */
  kinds: readonly LateGrantKind[];
  /** A short, user-facing reason when locked; `null` when the period is open for this employee. */
  check(userId: string, kind: LateGrantKind, periodKey: string): Promise<string | null>;
}
