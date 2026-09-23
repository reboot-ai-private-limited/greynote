import type { EmployeeProfile } from './employeeProfile.entity.js';

export interface EmployeeProfileRepositoryPort {
  findByUserId(userId: string): Promise<EmployeeProfile | null>;
  /** Batched — avoids one round-trip per user when building a page of `listUsers` summaries. */
  findByUserIds(userIds: string[]): Promise<EmployeeProfile[]>;
  /**
   * Partial `$set`, upserting the row into existence on first write — "does it exist yet" is
   * exactly what this port hides from every use case that touches onboarding data.
   */
  upsert(userId: string, input: Partial<Omit<EmployeeProfile, 'id' | 'userId'>>): Promise<EmployeeProfile>;
  /** Backs `listUsers`'s designation/manager filters — resolves which users a profile-level filter matches. */
  findUserIdsByFilter(filter: { designationId?: string; managerId?: string }): Promise<string[]>;
}
