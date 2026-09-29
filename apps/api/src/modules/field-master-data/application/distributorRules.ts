import { AppError } from '@/shared/errors/AppError.js';
import type { UserDirectoryPort } from '../domain/userDirectory.port.js';

/** The MR and the ASM a Distributor is handed to must be active FIELD employees; `null` clears one. */
export async function requireFieldUser(users: UserDirectoryPort, userId: string | null, field: string): Promise<void> {
  if (userId === null) return;
  const user = await users.findUserSummary(userId);
  if (!user) throw AppError.badRequest('No such employee.', { field });
  if (user.role !== 'FIELD') throw AppError.badRequest('Only field employees can be assigned to a distributor.', { field });
  if (user.status === 'inactive') throw AppError.conflict('That employee is inactive.', { field });
}
