import type { LateGrantKind } from '../../domain/lateGrant.entity.js';
import { assertPeriodKey } from '../kindRegistry.js';
import type { PeriodLocks } from '../periodLocks.js';

/** The grant form's live check: is this employee's period still open for a late entry? Read-only; the grant itself checks again. */
export class PreviewLateUseCase {
  constructor(private readonly locks: PeriodLocks) {}

  async execute(input: { userId: string; kind: LateGrantKind; periodKey: string }): Promise<{ lockedReason: string | null }> {
    assertPeriodKey(input.kind, input.periodKey);
    return { lockedReason: await this.locks.reason(input.userId, input.kind, input.periodKey) };
  }
}
