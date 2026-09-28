import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

export interface Actor {
  id: string;
  role: RoleName;
}

/** A Plan is readable by its owner, anyone above them in the chain (read-only), and Admin. */
export async function assertCanRead(users: UserDirectoryPort, actor: Actor, ownerId: string): Promise<void> {
  if (actor.id === ownerId || actor.role === 'ADMIN') return;
  const chain = await users.getManagerChain(ownerId);
  if (!chain.some((m) => m.id === actor.id)) throw AppError.forbidden();
}
