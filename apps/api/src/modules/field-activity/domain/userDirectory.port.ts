import type { RoleName } from '@greynote/contracts';

export interface DirectoryUser {
  id: string;
  name: string;
  employeeCode: string;
  role: RoleName;
  status: 'active' | 'pending' | 'inactive';
}

/** Field Activity's narrow view of Identity; `identity.contract` satisfies it structurally. */
export interface UserDirectoryPort {
  findUserSummary(userId: string): Promise<DirectoryUser | null>;
  /** Nearest Higher Manager first, then everyone above; `[]` at the top. */
  getManagerChain(userId: string): Promise<DirectoryUser[]>;
  /** Everyone below this manager, at any depth. */
  getDownline(managerId: string): Promise<DirectoryUser[]>;
  /** Whether a compliance block (HLD 10) stops this user submitting anything new. */
  isBlocked(userId: string): Promise<boolean>;
}
