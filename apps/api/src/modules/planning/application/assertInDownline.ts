import { AppError } from '@/shared/errors/AppError.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

/** Everyone below the manager at any depth, active, is a possible `workWith` — checked against today's team. */
export async function assertInDownline(users: UserDirectoryPort, managerId: string, ids: string[], field: string): Promise<void> {
  if (ids.length === 0) return;
  const below = new Set((await users.getDownline(managerId)).filter((u) => u.status === 'active').map((u) => u.id));
  const outside = ids.filter((id) => !below.has(id));
  if (outside.length > 0) {
    throw AppError.badRequest('You can only work with active people in your team.', { field, userIds: outside });
  }
}
