import type { RoleName } from '@greynote/contracts';

export interface DirectoryUser {
  id: string;
  name: string;
  employeeCode: string;
  role: RoleName;
  status: 'active' | 'pending' | 'inactive';
}

/** Field Master Data's narrow view of Identity; `identity.contract` satisfies it structurally. */
export interface UserDirectoryPort {
  findUserSummary(userId: string): Promise<DirectoryUser | null>;
  /** Unknown ids are skipped. */
  getUserSummaries(userIds: string[]): Promise<DirectoryUser[]>;
  /** Ids of up to `limit` users (default 200) whose name, employee code or email contains `term`, optionally only among `restrictTo`. */
  findUserIdsByName(term: string, options?: { restrictTo?: string[]; limit?: number }): Promise<string[]>;
  /** Everyone below this manager at any depth. */
  getDownline(managerId: string): Promise<DirectoryUser[]>;
  /** Designation levels (1 = MR; higher = a manager). Unknown ids are skipped. */
  getDesignationLevels(userIds: string[]): Promise<Array<{ userId: string; level: number }>>;
}
