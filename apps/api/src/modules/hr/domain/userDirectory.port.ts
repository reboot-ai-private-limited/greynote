import type { RoleName } from '@greynote/contracts';

export interface DirectoryUser {
  id: string;
  name: string;
  employeeCode: string;
  role: RoleName;
  status: 'active' | 'pending' | 'inactive';
}

/** HR's narrow view of Identity; `identity.contract` satisfies it structurally. */
export interface UserDirectoryPort {
  findUserSummary(userId: string): Promise<DirectoryUser | null>;
  /** Nearest Higher Manager first, then everyone above; `[]` at the top. */
  getManagerChain(userId: string): Promise<DirectoryUser[]>;
  getDownline(managerId: string): Promise<DirectoryUser[]>;
  getEmploymentDetails(userId: string): Promise<{ payBandId: string | null; dateOfJoining: Date | null; onProbation: boolean; probationMonths: number | null } | null>;
  listPayBands(): Promise<Array<{ id: string; name: string }>>;
}
