import type { RoleName } from '@greynote/contracts';

export interface DirectoryUser {
  id: string;
  name: string;
  role: RoleName;
  status: 'active' | 'pending' | 'inactive';
}

/** Late Grants' narrow view of Identity — `identity.contract` satisfies it structurally. */
export interface UserDirectoryPort {
  getUserSummaries(userIds: string[]): Promise<DirectoryUser[]>;
  /** Nearest Higher Manager first, then everyone above. */
  getManagerChain(userId: string): Promise<DirectoryUser[]>;
  getDownline(managerId: string): Promise<DirectoryUser[]>;
  /** Every active field employee. */
  listActiveFieldUserIds(): Promise<string[]>;
}
