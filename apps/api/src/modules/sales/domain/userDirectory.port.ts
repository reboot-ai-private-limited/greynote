import type { RoleName } from '@greynote/contracts';

export interface DirectoryUser {
  id: string;
  name: string;
  employeeCode: string;
  role: RoleName;
  status: 'active' | 'pending' | 'inactive';
}

/** Sales' narrow view of Identity; `identity.contract` satisfies it structurally. */
export interface UserDirectoryPort {
  getUserSummaries(userIds: string[]): Promise<DirectoryUser[]>;
  /** Everyone below this manager, at any depth. */
  getDownline(managerId: string): Promise<DirectoryUser[]>;
  /** Name and current designation of each of these users (any status; unknown ids are skipped). */
  namePeople(userIds: string[]): Promise<Array<{ id: string; name: string; designation: string | null }>>;
  /** The designation level of each of these users (MR 1 … NSM 5); users without a designation are left out. */
  getDesignationLevels(userIds: string[]): Promise<Array<{ userId: string; level: number }>>;
  /** Every active FIELD employee's id. */
  listActiveFieldUserIds(): Promise<string[]>;
}
