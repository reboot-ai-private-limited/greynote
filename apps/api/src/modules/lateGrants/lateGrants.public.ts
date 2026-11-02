import type { LateGrantGate } from './application/lateGrantGate.js';
import type { PeriodLockGuard } from './domain/periodLock.port.js';
import type { LateGrantRepositoryPort } from './domain/lateGrant.repository.port.js';
import type { PeriodLocks } from './application/periodLocks.js';

export type { LateGrant, LateGrantKind } from './domain/lateGrant.entity.js';
export type { PeriodLockGuard } from './domain/periodLock.port.js';
export type { LateGrantGate } from './application/lateGrantGate.js';
export type { LateGrantRepositoryPort } from './domain/lateGrant.repository.port.js';
export type { PeriodLocks } from './application/periodLocks.js';

/**
 * What other modules may use of Late Grants: spend an exception where a deadline is enforced (`gate`), and contribute a lock guard
 * for state they own that makes a late entry unsafe (`addLockGuard`).
 */
export interface LateGrantsPublicContract {
  gate: LateGrantGate;
  /** The one store of grants, for a module that keeps its own grant screens while it moves over to the unified ones. */
  grants: LateGrantRepositoryPort;
  /** Why a period is closed to late entries; every grant, and every spend of one, is checked against it. */
  locks: PeriodLocks;
  addLockGuard(guard: PeriodLockGuard): void;
}
