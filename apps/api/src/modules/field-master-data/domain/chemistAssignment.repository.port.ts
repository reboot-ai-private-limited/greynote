import type { ChemistAssignment } from './chemistAssignment.entity.js';

export interface ChemistAssignmentRepositoryPort {
  /** Everyone this Chemist is assigned to now. */
  listActiveForChemist(chemistId: string): Promise<ChemistAssignment[]>;
  /** The active assignments of each of these Chemists (one with none is absent). */
  listActiveForChemists(chemistIds: string[]): Promise<ChemistAssignment[]>;
  /** Every active assignment of these employees, e.g. a manager's downline. */
  listActiveForUsers(userIds: string[]): Promise<ChemistAssignment[]>;
  /** Newest first. */
  listForChemist(chemistId: string): Promise<ChemistAssignment[]>;
  isAssigned(userId: string, chemistId: string): Promise<boolean>;
  /** Idempotent: assigning someone who already holds the Chemist returns the existing row. */
  assign(input: { chemistId: string; userId: string; assignedBy: string }): Promise<ChemistAssignment>;
  /** Ends this one MR's assignment only; `false` if they had none. */
  unassign(chemistId: string, userId: string, by: string): Promise<boolean>;
  /** Ends every active assignment of a leaving employee; returns how many. */
  endAllForUser(userId: string, by: string): Promise<number>;
}
