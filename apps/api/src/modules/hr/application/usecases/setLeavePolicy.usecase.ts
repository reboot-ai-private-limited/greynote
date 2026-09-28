import { AppError } from '@/shared/errors/AppError.js';
import type { LeavePolicy } from '../../domain/leavePolicy.entity.js';
import type { LeavePolicyRepositoryPort } from '../../domain/leavePolicy.repository.port.js';
import type { LeaveTypeRepositoryPort } from '../../domain/leaveType.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';

/**
 * Set a grade's default days per leave year for one paid type. Applies to balances seeded from now
 * on — already-seeded ones stay as they are (LLD: the seed is a one-time copy).
 */
export class SetLeavePolicyUseCase {
  constructor(
    private readonly policies: LeavePolicyRepositoryPort,
    private readonly types: LeaveTypeRepositoryPort,
    private readonly users: UserDirectoryPort,
  ) {}

  async execute(input: { payBandId: string; leaveTypeId: string; defaultDays: number; actorId: string }): Promise<LeavePolicy> {
    const payBands = await this.users.listPayBands();
    if (!payBands.some((b) => b.id === input.payBandId)) throw AppError.notFound('No such pay band.');
    const type = await this.types.findById(input.leaveTypeId);
    if (!type) throw AppError.notFound('No such leave type.');
    if (!type.isPaid) {
      throw AppError.badRequest('An unpaid leave type has no balance, so it has no default days.', { field: 'leaveTypeId' });
    }
    return this.policies.upsert({
      payBandId: input.payBandId,
      leaveTypeId: input.leaveTypeId,
      defaultDays: input.defaultDays,
      updatedBy: input.actorId,
    });
  }
}
