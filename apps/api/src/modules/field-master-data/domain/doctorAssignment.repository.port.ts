import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { DoctorAssignment } from './doctorAssignment.entity.js';

export interface DoctorAssignmentRepositoryPort {
  findActiveForDoctor(doctorId: string): Promise<DoctorAssignment | null>;
  /** The active assignment of each of these Doctors (a Doctor with none is absent). */
  findActiveForDoctors(doctorIds: string[]): Promise<DoctorAssignment[]>;
  /** Newest first. */
  listForDoctor(doctorId: string): Promise<DoctorAssignment[]>;
  /** Ends the Doctor's active assignment, if any. */
  endActive(doctorId: string, by: string, ctx: TransactionContext): Promise<void>;
  /** Throws `DuplicateRecordError` if another active assignment for the Doctor appeared meanwhile. */
  create(input: { doctorId: string; userId: string; assignedBy: string }, ctx: TransactionContext): Promise<DoctorAssignment>;
  /** Ends the active assignment only if it belongs to this user; `false` if there was none. */
  endActiveIfUser(doctorId: string, userId: string, by: string): Promise<boolean>;
}
