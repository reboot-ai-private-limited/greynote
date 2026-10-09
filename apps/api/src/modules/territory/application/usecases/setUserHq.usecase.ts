import type { TransactionRunnerPort } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { HqRepositoryPort } from '../../domain/hq.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { UserHqAssignment } from '../../domain/userHqAssignment.entity.js';
import type { UserHqAssignmentRepositoryPort } from '../../domain/userHqAssignment.repository.port.js';

/**
 * Set a FIELD employee's HQ — ends the current one and starts the new one in one transaction.
 * Same user checks as `AssignRouteUseCase`: FIELD only, not inactive (a `pending` user can be set
 * up). Setting the HQ they already have is a no-op.
 */
export class SetUserHqUseCase {
  constructor(
    private readonly assignments: UserHqAssignmentRepositoryPort,
    private readonly hqs: HqRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly transactions: TransactionRunnerPort,
  ) {}

  async execute(userId: string, hqId: string, actorId: string): Promise<UserHqAssignment> {
    const user = await this.users.findUserSummary(userId);
    if (!user) throw AppError.notFound('No such employee.');
    if (user.role !== 'FIELD') throw AppError.badRequest('Only field employees have an HQ.', { field: 'userId' });
    if (user.status === 'inactive') throw AppError.conflict('That employee is inactive.', { field: 'userId' });

    const hq = await this.hqs.findById(hqId);
    if (!hq) throw AppError.badRequest('No such HQ.', { field: 'hqId' });
    if (hq.status !== 'active') throw AppError.conflict('This HQ is inactive. Reactivate it first.', { field: 'hqId' });

    // Identity keeps a copy of the current HQ and zone for the employee list. It is written after the assignment, and also when
    // nothing changes, so a write that failed last time is repaired by saving the same HQ again.
    const current = await this.assignments.findActive(userId);
    if (current?.hqId === hqId) {
      await this.users.recordUserTerritory(userId, { hqId, zoneId: hq.zoneId });
      return current;
    }

    const created = await this.transactions.run(async (ctx) => {
      await this.assignments.endActive(userId, actorId, ctx);
      return this.assignments.create({ userId, hqId, assignedBy: actorId }, ctx);
    });
    if (!created) throw AppError.conflict('This employee’s HQ was changed at the same time. Reload and try again.');
    await this.users.recordUserTerritory(userId, { hqId, zoneId: hq.zoneId });
    return created;
  }
}
