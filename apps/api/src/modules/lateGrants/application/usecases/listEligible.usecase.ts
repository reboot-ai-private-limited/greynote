import { AppError } from '@/shared/errors/AppError.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { Actor } from '../actor.js';

/**
 * The employees a bulk exception can be aimed at, for the form's shortcuts: Admin — everyone active, or one manager's whole team;
 * a field manager — their own team only. Only active field employees; the grant itself still checks each one.
 */
export class ListEligibleUseCase {
  constructor(private readonly users: UserDirectoryPort) {}

  async execute(actor: Actor, scope: { all?: boolean; managerId?: string | undefined }): Promise<string[]> {
    if (actor.role !== 'ADMIN') {
      if (actor.role !== 'FIELD') throw AppError.forbidden();
      if (scope.all || (scope.managerId && scope.managerId !== actor.id)) throw AppError.forbidden('You can only pick your own team.');
      return this.team(actor.id);
    }
    if (scope.managerId) return this.team(scope.managerId);
    if (scope.all) return this.users.listActiveFieldUserIds();
    throw AppError.badRequest('Say whose team, or everyone.', { field: 'managerId' });
  }

  private async team(managerId: string): Promise<string[]> {
    return (await this.users.getDownline(managerId)).filter((u) => u.role === 'FIELD' && u.status === 'active').map((u) => u.id);
  }
}
