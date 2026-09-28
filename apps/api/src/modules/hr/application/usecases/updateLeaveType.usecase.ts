import { AppError } from '@/shared/errors/AppError.js';
import type { LeaveType } from '../../domain/leaveType.entity.js';
import type { LeaveTypeRepositoryPort } from '../../domain/leaveType.repository.port.js';

/**
 * Rename, (de)activate, or flip `isPaid` — the last only while nothing refers to the type, since
 * a policy, balance or leave built on one meaning would be wrong under the other.
 */
export class UpdateLeaveTypeUseCase {
  constructor(
    private readonly types: LeaveTypeRepositoryPort,
    private readonly isInUse: (leaveTypeId: string) => Promise<boolean>,
  ) {}

  async execute(id: string, change: Partial<Pick<LeaveType, 'name' | 'isPaid' | 'active'>>): Promise<LeaveType> {
    const type = await this.types.findById(id);
    if (!type) throw AppError.notFound('No such leave type.');
    if (change.isPaid !== undefined && change.isPaid !== type.isPaid && (await this.isInUse(id))) {
      throw AppError.conflict('This leave type is already in use, so whether it’s paid can’t change.', { field: 'isPaid' });
    }
    const updated = await this.types.update(id, change);
    if (!updated) throw AppError.conflict('A leave type with this name already exists.', { field: 'name' });
    return updated;
  }
}
