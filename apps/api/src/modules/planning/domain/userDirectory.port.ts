import type { RoleName } from '@greynote/contracts';

export interface DirectoryUser {
  id: string;
  name: string;
  role: RoleName;
  status: 'active' | 'pending' | 'inactive';
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
  isBlocked(userId: string): Promise<boolean>;
}
