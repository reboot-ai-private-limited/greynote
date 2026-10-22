import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { Doctor } from './doctor.entity.js';

/** What other modules hold that points at a doctor: counted through their contracts, bound by the composition root. */
export interface DoctorReferences {
  /** Daily Plans from today on that list it: still editable by the employee, or submitted/approved. */
  plannedDays: { editable: number; locked: number };
  calls: number;
  openGifts: number;
  openServices: number;
  visuals: number;
}

export const NO_DOCTOR_REFERENCES: DoctorReferences = { plannedDays: { editable: 0, locked: 0 }, calls: 0, openGifts: 0, openServices: 0, visuals: 0 };

/**
 * The modules above (or beside) Field Master Data, as the composition root wires them. `release` takes the doctor off the Daily
 * Plans from today on that are still editable — one employee's (`userId`, when an MR loses the doctor) or everyone's (`null`, when
 * the doctor is deactivated or deleted) — and returns how many plans changed.
 */
export interface DoctorReferencesPort {
  count(doctorId: string): Promise<DoctorReferences>;
  release(doctorId: string, userId: string | null): Promise<number>;
}

/** Where a deleted doctor is kept, so history (calls, reports, gifts) still shows its name. */
export interface DoctorArchivePort {
  /** In the caller's transaction: copies the doctor to the archive, deletes its assignments and the doctor. */
  remove(doctor: Doctor, lastAssignedUserId: string | null, actorId: string, ctx: TransactionContext): Promise<void>;
  /** A deleted doctor as it was, now `inactive`; `null` if it was never deleted. */
  findArchived(id: string): Promise<Doctor | null>;
}
