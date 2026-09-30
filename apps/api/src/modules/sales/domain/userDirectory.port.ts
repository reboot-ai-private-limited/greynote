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
  /** Every active FIELD employee's id. */
  listActiveFieldUserIds(): Promise<string[]>;
}
