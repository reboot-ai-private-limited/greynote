import type { RoleName } from '@greynote/contracts';

/**
 * Territory's narrow view of Identity — domain/ never imports `modules/identity/`. The
 * top-level `container.ts` passes `identity.contract`, which satisfies this structurally.
 */
export interface UserDirectoryPort {
  findUserSummary(userId: string): Promise<{
    id: string;
    employeeCode: string;
    name: string;
    role: RoleName;
    status: 'active' | 'pending' | 'inactive';
  } | null>;
}
