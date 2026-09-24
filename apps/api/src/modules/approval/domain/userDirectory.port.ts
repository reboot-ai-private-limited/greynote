import type { RoleName } from '@greynote/contracts';

export interface DirectoryUser {
  id: string;
  employeeCode: string;
  name: string;
  role: RoleName;
  /** The Nearest Higher Manager; null at the top of the chain (and for non-FIELD users). */
  managerId: string | null;
}

/**
 * The approval module's narrow view of Identity — domain/ never imports `modules/identity/`.
 * The top-level `container.ts` passes `identity.contract`, which satisfies this structurally.
 */
export interface UserDirectoryPort {
  findUserSummary(userId: string): Promise<DirectoryUser | null>;
  /** Batched; unknown ids are skipped. */
  getUserSummaries(userIds: string[]): Promise<DirectoryUser[]>;
  getDirectReports(managerId: string): Promise<DirectoryUser[]>;
  /** Everyone below, with `depth` 1 = direct report. */
  getDownline(managerId: string): Promise<Array<DirectoryUser & { depth: number }>>;
  /** Nearest Higher Manager first, then everyone above; `[]` at the top. */
  getManagerChain(userId: string): Promise<DirectoryUser[]>;
}
