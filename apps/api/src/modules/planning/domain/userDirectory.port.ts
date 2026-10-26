import type { RoleName } from '@greynote/contracts';

export interface DirectoryUser {
  id: string;
  name: string;
  role: RoleName;
  status: 'active' | 'pending' | 'inactive';
}

/** A colleague as a plan names them: `label` is `Asha Rao (ASM)`, or just the name with no designation. */
export interface PlanPerson {
  id: string;
  name: string;
  designation: string | null;
  label: string;
}

/**
 * Planning's narrow view of Identity — domain/ never imports `modules/identity/`. The top-level
 * `container.ts` passes `identity.contract`, which satisfies this structurally.
 */
export interface UserDirectoryPort {
  /** Batched; unknown ids are skipped. */
  getUserSummaries(userIds: string[]): Promise<DirectoryUser[]>;
  /** Nearest Higher Manager first, then everyone above; `[]` at the top. */
  getManagerChain(userId: string): Promise<DirectoryUser[]>;
  /** Everyone below this manager, at any depth. */
  getDownline(managerId: string): Promise<DirectoryUser[]>;
  isBlocked(userId: string): Promise<boolean>;
  /** Name and current designation of each user, in the order given; unknown ids are skipped. */
  namePeople(userIds: string[]): Promise<PlanPerson[]>;
  /** Designation level of each user (MR 1 … NSM 5); users without a designation are left out. */
  getDesignationLevels(userIds: string[]): Promise<Array<{ userId: string; level: number }>>;
}
