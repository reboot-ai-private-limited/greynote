import { AppError } from '@/shared/errors/AppError.js';
import type { LateGrantKind } from '../domain/lateGrant.entity.js';
import type { PeriodLockGuard } from '../domain/periodLock.port.js';

/** The guards modules contribute at wiring time. With none bound, nothing is locked (the module is usable on its own and in tests). */
export class PeriodLocks {
  private readonly guards: PeriodLockGuard[] = [];

  bind(guard: PeriodLockGuard): void {
    this.guards.push(guard);
  }

  /** Why this employee's period can't take a late entry any more, or `null`. */
  async reason(userId: string, kind: LateGrantKind, periodKey: string): Promise<string | null> {
    for (const guard of this.guards) {
      if (!guard.kinds.includes(kind)) continue;
      const reason = await guard.check(userId, kind, periodKey);
      if (reason) return reason;
    }
    return null;
  }

  async assertOpen(userId: string, kind: LateGrantKind, periodKey: string): Promise<void> {
    const reason = await this.reason(userId, kind, periodKey);
    if (reason) {
      throw new AppError({ statusCode: 409, code: 'GRANT_PERIOD_LOCKED', message: reason, publicDetails: { kind, periodKey } });
    }
  }
}
