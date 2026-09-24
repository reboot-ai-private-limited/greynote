import type { RoleName } from '@greynote/contracts';

/**
 * The approval module's narrow view of Identity — domain/ never imports `modules/identity/`.
 * The top-level `container.ts` passes `identity.contract`, which satisfies this structurally.
 */
export interface UserDirectoryPort {
  findUserSummary(userId: string): Promise<{
    id: string;
    role: RoleName;
    /** The Nearest Higher Manager; null at the top of the chain (and for non-FIELD users). */
    managerId: string | null;
  } | null>;
}
