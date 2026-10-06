import type { Promotion } from './promotion.entity.js';

/** What `create` takes: everything the caller decides; the rest starts empty. */
export type NewPromotion = Omit<Promotion, 'id' | 'createdAt' | 'status' | 'ctcAssignmentId' | 'appliedAt' | 'cancelledAt' | 'claimedAt' | 'note' | 'skippedMoves' | 'unplannedReportIds'>;

export interface PromotionRepositoryPort {
  create(input: NewPromotion): Promise<Promotion>;
  findById(id: string): Promise<Promotion | null>;
  /** Newest first. */
  listByUser(userId: string): Promise<Promotion[]>;
  findScheduledByUser(userId: string): Promise<Promotion | null>;
  /** Newest first, at most 200. */
  list(filter: { status?: Promotion['status'] | undefined }): Promise<Promotion[]>;
  /**
   * Atomically takes the oldest SCHEDULED promotion whose month is `month` or earlier and that no live run holds (never claimed, or the
   * claim is older than `leaseMs`). `null` when there is none. Two servers asking at once never get the same one.
   */
  claimDue(month: string, now: Date, leaseMs: number): Promise<Promotion | null>;
  markCtcAssignment(id: string, ctcAssignmentId: string): Promise<void>;
  markApplied(id: string, input: { appliedAt: Date; note: string | null; skippedMoves: Promotion['skippedMoves']; unplannedReportIds: string[] }): Promise<void>;
  /** Leaves it SCHEDULED for the next run, with why. */
  markFailed(id: string, note: string): Promise<void>;
  /** Only a SCHEDULED one; `false` if it was no longer (applied or cancelled in the meantime). */
  cancel(id: string, at: Date): Promise<boolean>;
}
