import type { CtcAssignment } from './ctcAssignment.entity.js';

export interface CtcAssignmentRepositoryPort {
  create(input: Omit<CtcAssignment, 'id' | 'createdAt'>): Promise<CtcAssignment>;
  /** Newest `effectiveFrom` first, then newest saved first. */
  listByUser(userId: string): Promise<CtcAssignment[]>;
  /** The revision in force for `month`: the latest `effectiveFrom` not after it; ties go to the one saved last. */
  findEffective(userId: string, month: string): Promise<CtcAssignment | null>;
  listUserIds(): Promise<string[]>;
}
