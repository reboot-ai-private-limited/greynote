import type { RoleName } from '@greynote/contracts';

/** The sync module's narrow view of Identity; `identity.contract` satisfies it structurally. */
export interface UserDirectoryPort {
  findUserSummary(userId: string): Promise<{ id: string; role: RoleName; status: 'active' | 'pending' | 'inactive' } | null>;
}
